"""Keep asking Oracle Cloud for an Always Free server until capacity frees up. (c) mnlovo

Free-tier guard: it only ever creates Always Free shapes and refuses to go past the free limits
(Ampere: 4 OCPU / 24 GB in total, at most 2 E2.1.Micro, 200 GB of boot volumes in total).

Order: Ampere 4/24 → 2/12 → 1/6 → E2.1.Micro (only if there is no server yet).
It stops once an Ampere server exists. If it gets a Micro first, it keeps trying for Ampere.

Needs ~/.oci/config (profile DEFAULT) with an API key, and ~/.ssh/mncord_oracle.pub.
Run:  python infra/oracle-retry.py
"""
import datetime
import os
import sys
import time

import oci

FREE_A1_OCPU, FREE_A1_MEM, FREE_MICRO, FREE_BOOT_GB = 4, 24, 2, 200
A1_SIZES = [(4, 24), (2, 12), (1, 6)]
A1_BOOT_GB, MICRO_BOOT_GB = 100, 50
WAIT_S = 60
NAME = "mncord-server"
LOG = os.path.expanduser("~/.oci/mncord-retry.log")


def log(msg: str) -> None:
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cfg = oci.config.from_file()
tenancy = cfg["tenancy"]
compute = oci.core.ComputeClient(cfg)
net = oci.core.VirtualNetworkClient(cfg)
blk = oci.core.BlockstorageClient(cfg)
ident = oci.identity.IdentityClient(cfg)
ssh_key = open(os.path.expanduser("~/.ssh/mncord_oracle.pub"), encoding="utf-8").read().strip()
ads = [a.name for a in ident.list_availability_domains(tenancy).data]


def ensure_network() -> str:
    """One VCN + public subnet + internet gateway; opens 80/443 TCP and 443 UDP (22 is open by default)."""
    vcns = [v for v in net.list_vcns(tenancy).data if v.display_name == "mncord-vcn" and v.lifecycle_state == "AVAILABLE"]
    if vcns:
        vcn = vcns[0]
    else:
        log("creating network mncord-vcn")
        vcn = net.create_vcn(oci.core.models.CreateVcnDetails(compartment_id=tenancy, cidr_blocks=["10.0.0.0/16"], display_name="mncord-vcn", dns_label="mncord")).data
        oci.wait_until(net, net.get_vcn(vcn.id), "lifecycle_state", "AVAILABLE")
    igws = net.list_internet_gateways(tenancy, vcn_id=vcn.id).data
    igw = igws[0] if igws else net.create_internet_gateway(oci.core.models.CreateInternetGatewayDetails(compartment_id=tenancy, vcn_id=vcn.id, is_enabled=True, display_name="mncord-igw")).data
    rt = net.get_route_table(vcn.default_route_table_id).data
    if not any(r.destination == "0.0.0.0/0" for r in rt.route_rules):
        net.update_route_table(rt.id, oci.core.models.UpdateRouteTableDetails(route_rules=rt.route_rules + [oci.core.models.RouteRule(destination="0.0.0.0/0", destination_type="CIDR_BLOCK", network_entity_id=igw.id)]))
    sl = net.get_security_list(vcn.default_security_list_id).data
    rules = list(sl.ingress_security_rules)
    def has(proto: str, port: int) -> bool:
        for r in rules:
            o = r.tcp_options if proto == "6" else r.udp_options
            if r.protocol == proto and o and o.destination_port_range and o.destination_port_range.min <= port <= o.destination_port_range.max:
                return True
        return False
    rng = lambda p: oci.core.models.PortRange(min=p, max=p)
    for proto, port in (("6", 80), ("6", 443), ("17", 443)):
        if not has(proto, port):
            rules.append(oci.core.models.IngressSecurityRule(protocol=proto, source="0.0.0.0/0", tcp_options=oci.core.models.TcpOptions(destination_port_range=rng(port)) if proto == "6" else None, udp_options=oci.core.models.UdpOptions(destination_port_range=rng(port)) if proto == "17" else None))
    if len(rules) != len(sl.ingress_security_rules):
        net.update_security_list(sl.id, oci.core.models.UpdateSecurityListDetails(ingress_security_rules=rules))
        log("opened ports 80/tcp, 443/tcp, 443/udp")
    subs = [s for s in net.list_subnets(tenancy, vcn_id=vcn.id).data if s.display_name == "mncord-subnet"]
    if subs:
        return subs[0].id
    sub = net.create_subnet(oci.core.models.CreateSubnetDetails(compartment_id=tenancy, vcn_id=vcn.id, cidr_block="10.0.0.0/24", display_name="mncord-subnet", dns_label="pub", prohibit_public_ip_on_vnic=False)).data
    oci.wait_until(net, net.get_subnet(sub.id), "lifecycle_state", "AVAILABLE")
    log("created public subnet")
    return sub.id


def usage():
    live = [i for i in compute.list_instances(tenancy).data if i.lifecycle_state not in ("TERMINATED", "TERMINATING")]
    a1 = [i for i in live if i.shape == "VM.Standard.A1.Flex"]
    micro = [i for i in live if i.shape == "VM.Standard.E2.1.Micro"]
    boot = sum(b.size_in_gbs for ad in ads for b in blk.list_boot_volumes(availability_domain=ad, compartment_id=tenancy).data if b.lifecycle_state not in ("TERMINATED", "TERMINATING"))
    ocpu = sum(i.shape_config.ocpus for i in a1)
    mem = sum(i.shape_config.memory_in_gbs for i in a1)
    return a1, micro, ocpu, mem, boot


def image_for(shape: str) -> str:
    imgs = compute.list_images(tenancy, operating_system="Canonical Ubuntu", operating_system_version="24.04", shape=shape, sort_by="TIMECREATED", sort_order="DESC").data
    imgs = [i for i in imgs if "Minimal" not in i.display_name]
    return imgs[0].id


def launch(shape: str, ad: str, subnet: str, boot_gb: int, ocpus=None, mem=None):
    details = oci.core.models.LaunchInstanceDetails(
        compartment_id=tenancy, availability_domain=ad, display_name=NAME, shape=shape,
        shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(ocpus=ocpus, memory_in_gbs=mem) if ocpus else None,
        source_details=oci.core.models.InstanceSourceViaImageDetails(image_id=image_for(shape), boot_volume_size_in_gbs=boot_gb),
        create_vnic_details=oci.core.models.CreateVnicDetails(subnet_id=subnet, assign_public_ip=True),
        metadata={"ssh_authorized_keys": ssh_key},
    )
    return compute.launch_instance(details).data


def public_ip(inst_id: str) -> str:
    oci.wait_until(compute, compute.get_instance(inst_id), "lifecycle_state", "RUNNING", max_wait_seconds=900)
    att = compute.list_vnic_attachments(tenancy, instance_id=inst_id).data[0]
    return net.get_vnic(att.vnic_id).data.public_ip


def main() -> None:
    subnet = ensure_network()
    log(f"watching for capacity in {', '.join(ads)} (every {WAIT_S}s). Ctrl+C to stop.")
    tries = 0
    while True:
        a1, micro, ocpu, mem, boot = usage()
        if a1:
            log(f"Ampere server exists: {a1[0].display_name} ({a1[0].lifecycle_state}). Done.")
            return
        plan = [("VM.Standard.A1.Flex", A1_BOOT_GB, o, m) for o, m in A1_SIZES if ocpu + o <= FREE_A1_OCPU and mem + m <= FREE_A1_MEM and boot + A1_BOOT_GB <= FREE_BOOT_GB]
        if not micro and len(micro) < FREE_MICRO and boot + MICRO_BOOT_GB <= FREE_BOOT_GB:
            plan.append(("VM.Standard.E2.1.Micro", MICRO_BOOT_GB, None, None))
        if not plan:
            log("nothing more fits in the free limits; stopping (no charges).")
            return
        for shape, gb, o, m in plan:
            for ad in ads:
                try:
                    inst = launch(shape, ad, subnet, gb, o, m)
                    log(f"GOT IT: {shape} {o or 1} OCPU / {m or 1} GB in {ad}; waiting for it to boot…")
                    ip = public_ip(inst.id)
                    log(f"RUNNING. Public IP: {ip}   ssh -i ~/.ssh/mncord_oracle ubuntu@{ip}")
                    break
                except oci.exceptions.ServiceError as e:
                    if e.status == 429:
                        time.sleep(30)
                    elif "capacity" not in (e.message or "").lower():
                        log(f"{shape}: {e.status} {e.code}: {e.message}")
            else:
                continue
            break
        tries += 1
        if tries % 30 == 1:
            log(f"still no capacity (attempt {tries}); trying again every {WAIT_S}s")
        time.sleep(WAIT_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
