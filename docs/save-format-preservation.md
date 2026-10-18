# Save format preservation

The portable envelope uses schema 5. A higher integral schema version means the
save requires a newer game; it does not mean the career is damaged. The game
preserves that typed refusal through local recovery and shared provider loads.
Local and Steam slot listings keep the save visible with an **Update required**
notice, including when an older supported copy also exists.

Local saves and archive restores refuse to replace an unsupported head.
Retention checks every recovery archive, including previously verified ones,
before pruning. Refusal rolls back the enclosing head/archive transaction.
Recovery stops at an unsupported candidate instead of silently choosing an older
generation. Genuine supported-format corruption still permits verified recovery
and an intentional replacement.

Steam upload and authenticated Supabase upload read the existing slot before
writing. A recognized future format or failed preservation read blocks the
upload. A supported local commit remains saved, and its failed cloud intent stays
in the durable retry queue. Updating the game or resolving the remote condition
is required before that intent can sync.

These client checks do not provide atomic cloud compare-and-swap or retrofit old
binaries. Supabase remains disabled in the shipping beta configuration; its
direct metadata listing does not classify envelope versions. Server-side
downgrade protection requires verified target schema, migration and access-policy
evidence before cloud enablement. Steam concurrency and older-client behavior
also require actual two-device certification. No database layout migration,
history truncation, rule change or budget increase accompanies these guards.
