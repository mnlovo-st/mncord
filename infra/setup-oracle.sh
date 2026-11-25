#!/usr/bin/env bash
# One-time setup of a fresh Oracle Always Free Ubuntu VM (ARM Ampere or x64). Run as the default user:
#   curl -fsSL https://raw.githubusercontent.com/mnlovo-st/mncord/main/infra/setup-oracle.sh | bash
# (or copy the repo and run: bash infra/setup-oracle.sh)
set -euo pipefail

echo "== system updates + automatic security updates"
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades age
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "== swap (2 GB): keeps the tiny 1 GB VM alive during builds and bursts"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-mncord.conf >/dev/null && sudo sysctl -p /etc/sysctl.d/99-mncord.conf
fi

echo "== firewall (the Oracle VCN security list is opened by infra/oracle-retry.py)"
# Oracle's Ubuntu images ship iptables rules (reloaded at boot) that reject everything but SSH.
# Remove them FIRST, then let ufw own the firewall. (Flushing after ufw would wipe ufw's own rules.)
sudo iptables -F INPUT || true
sudo apt-get purge -y netfilter-persistent iptables-persistent >/dev/null 2>&1 || true
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
sudo ufw status verbose

echo "== SSH: keys only"
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh || sudo systemctl restart sshd
sudo systemctl enable --now fail2ban

echo "== code"
sudo mkdir -p /opt/mncord && sudo chown "$USER" /opt/mncord
[ -d /opt/mncord/.git ] || git clone https://github.com/"${GH_OWNER:-mnlovo-st}"/mncord.git /opt/mncord

cat <<'NEXT'

Done. Next:
  1) cd /opt/mncord/infra && cp .env.example .env && node gen-secrets.mjs >> .env   (or use docker run node)
  2) edit .env: DOMAIN, CF_REALTIME_APP_ID, CF_REALTIME_APP_SECRET, SMTP_URL, MAIL_FROM, DUCKDNS_TOKEN
  3) bash update-dns.sh   (points the free DuckDNS name at this VM)
  4) docker compose --env-file .env up -d --build
  5) crontab -e  ->  0 4 * * * /opt/mncord/infra/backup.sh   and   */5 * * * * /opt/mncord/infra/update-dns.sh
Log out and back in once so the docker group applies.
NEXT
