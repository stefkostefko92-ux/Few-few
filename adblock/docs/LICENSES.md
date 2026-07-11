# Third-party filter lists

Supreme AdBlock bundles compiled versions of these public filter lists. The
compiled artifacts live in `rules/` and `cosmetic_generic.css` and are
regenerated with `node tools/build_filters.mjs`.

| List | Source | License | Used for |
|------|--------|---------|----------|
| EasyList | <https://easylist.to/easylist/easylist.txt> | GPLv3 / CC BY-SA 3.0 | ad network + cosmetic rules |
| EasyPrivacy | <https://easylist.to/easylist/easyprivacy.txt> | GPLv3 / CC BY-SA 3.0 | tracker rules |
| URLhaus hostfile | <https://urlhaus.abuse.ch/downloads/hostfile/> | CC0 | optional malware protection |

EasyList and EasyPrivacy are © The EasyList authors, dual-licensed under the
GNU General Public License v3 and Creative Commons Attribution-ShareAlike 3.0.
This attribution notice satisfies both. The lists are converted to
declarativeNetRequest JSON (data) with no modification of intent: unsupported
filter options are skipped, never approximated in ways that could block more
than the original rule.

URLhaus data is published by abuse.ch under CC0 (public domain).
