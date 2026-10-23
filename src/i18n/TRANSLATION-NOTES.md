# Translation review status

These interface dictionaries are authored translations, not native-reviewed certification. Automated checks validate keys, non-empty values and named placeholders; they cannot prove fluent wording. Complete means the 164-key English interface schema has a value for every key, not that every older plugin reply has been translated.

Where translation confidence was insufficient, no complete file was imported. The registered language remains selectable with explicit English fallback. Partial Indian-language dictionaries remain partial until replacement files pass checks.

Varieties reported with the imported translation batches:
- msa: standard Malay; fil: Filipino; ceb: Cebuano; jav: casual/ngoko Javanese.
- mon: standard Cyrillic Khalkha Mongolian; sin: Sinhala; khm: Khmer.
- cat: standard Central/IEC Catalan; glg: RAG-norm Galician.
- lav/lit: standard Latvian/Lithuanian, informal address.
- isl: standard Icelandic; eus: Basque Batua, informal zu.

The supplying translators particularly recommended native checking for Icelandic and Basque. Native review is useful for all files, especially transfer-review wording, permission errors and the no-money/no-gambling disclaimer. Sensitive strings were sampled during import, but that check is not a replacement for native review.

Exact current counts are generated in coverage.json by scripts/audit-locales.py. English, complete non-English schemas, partial dictionaries and registry entries must be reported separately. This file does not claim 100+ language coverage has been reached.

Welsh (cym) uses standard wording and formal chi; Irish (gle) follows An Caighdean. Welsh technical coinages and Irish "Frithbha" need native review. They were imported after schema and sensitive-string sample checks, not native certification.

The following 24 requested translation candidates remain English-fallback for this release because the supplying translators could not check output quality: pus, kur, tgk, amh, som, hau, yor, ibo, zul, xho, nso, tsn, sot, lug, tir, sun, mlg, lao, mya, bod, ori, asm, snd, san. This is a translation-confidence limitation, not a claim those languages cannot be translated. Pashto's registry code in this snapshot is pus, not pas.

Indian replacements tam/tel/kan/mal/pan/urd/nep use casual prompt wording and more formal transfer reviews. Urdu uses standard RTL text; no native tone review has been performed. Batch8 varieties: informal Belarusian; standard Georgian; Eastern Armenian; Cyrillic Kyrgyz; Latin Turkmen; Cyrillic Tatar and Bashkir. Tatar/Bashkir idiom most needs native checking. Uyghur (uig) was also withheld for insufficient translation confidence, bringing withheld candidates to25.
