-- M4: messaging core
-- Arabic-friendly search: normalise alef forms, taa marbuta, alef maqsura, tatweel and tashkeel, then lowercase.
-- A trigram index on the normalised text serves ILIKE '%…%' for any script.
alter table messages add column if not exists content_norm text generated always as (
  lower(regexp_replace(translate(content, 'أإآٱىةـ', 'اااايه'), '[ًٌٍَُِّْٰ]', '', 'g'))
) stored;
create index if not exists messages_norm_trgm on messages using gin (content_norm gin_trgm_ops);
drop index if exists messages_trgm;

-- which users a message mentions (for inbox + mention badges) already exists as message_mentions;
-- index to count unread mentions per channel fast
create index if not exists message_mentions_user_msg on message_mentions (user_id, message_id desc);

-- files: who may attach them and when they were attached
alter table files add column if not exists original_name text;
alter table files add column if not exists attached boolean not null default false;
