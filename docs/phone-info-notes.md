# Phone info deployed, October 3

Runtime: all three providers enabled with owner-approved free caps. Seeded one successful test per provider:999Veriphone,999IPQS,6DataCrawler attempts remain locally. IPQS35rolling-day limit retained. No automatic monthly reset or paid use.

`/truecaller +COUNTRYNUMBER yes` (`/phoneinfo` alias) is one private owner-only command. It gives separate Veriphone/IPQS/DataCrawler result sections, not a fabricated consensus. All providers default disabled with zero local cap. `/truecaller status` displays configuration and lifetime attempts left.

- Explicit international number required; no country guessed, no lists/bulk. Without `yes`, no number leaves the bot. Keys and queried numbers must not be logged. Quota file contains counts and reservation timestamps only, not numbers, names or results.
- Veriphone official v3 verify, HTTPS GET, key in Authorization header, static mode (one standard credit), record=false. It returns numbering-plan validity, original assigned carrier, type, country/region, not identity or live location. Public free offer is 1,000 validations/month, no card; account FREE 1,000/month confirmed; real owner-number GET200 verified.
- IPQS official phone endpoint, HTTPS GET. The service puts the key and number in URL path; do not log axios errors/URLs. Returns available basic metadata, associated name, fraud score/recent abuse/VoIP/risk signals. No enterprise identity enrichment, email addresses, precise address or add-on active/HLR data exposed. Public free offer 1,000 shared lookups/month, 35/day, no card. Names outside US/Canada have limited coverage. India names are not guaranteed. Real owner-number metadata/risk result200 verified, India associated name unavailable.
- Reservations are atomic and serialized before calls. Caps are lifetime attempts, max 1,000 per provider, not automatically refilled monthly (provider reset timezone/shared usage unverified). IPQS additionally limited conservatively to 35 in rolling 24 hours. Failed attempts count. Corrupt quota file blocks external requests. Local quota is single-process only, not a shared multi-server wallet.
- Provider errors/429/timeouts are sanitized and never retried. Next enabled sources still attempted after previous error/quota. No paid package, topup, current-carrier upgrade, retries, scraper or account rotation. Per-provider 15s/64KiB response bounds; redirects disabled; fixed endpoints.
- DataCrawler third-party marketplace connector is staged disabled by default. DataCrawler advertises 7 free requests/month, hard cap, but licensed Truecaller data access not verified. Branding a supplier 'unofficial' does not permit scraping. Official current Truecaller SDK is consented login/verification, not arbitrary caller-name API. Actual authorized owner-number response verified: GET getDetails countryCode=IN, national phone; status:true/data array. Requires exact matching e164Format. Basic associated name/carrier/type/country and safe city/state only; other countries blocked until parameter semantics verified.
- Results are provider claims, not verified identity, real-time phone activity, exact location, or proof of wrongdoing. Conflicting carriers are shown separately. Do not use scores for automatic sanctions.
- Approved free accounts created on sdabas916@gmail.com: Veriphone active FREE, initially0/1,000, next reset Nov 3; RapidAPI DataCrawler BASIC $0/no card, 7/month hard cap; IPQS activated with separately approved name/phone/marketing-call consent, initially0/1,000, Starter API key active. Keys vaulted and privately installed in runtime, never in public source. One approved owner-number test per provider: Veriphone JSON POST400 (uncharged0/1,000, corrected documented GET200: valid,Jio,mobile,India region); IPQS200 metadata/risk, name unavailable; DataCrawler200 reported name/carrier metadata, limit7/remaining6. The approved combined deployment is live. Real claims remain supplier data, not authenticated identity.

Sources:
https://veriphone.io/docs/v3
https://veriphone.io/docs
https://veriphone.io/
https://www.ipqualityscore.com/documentation/phone-number-validation-api/overview
https://www.ipqualityscore.com/documentation/phone-number-validation-api/response-parameters
https://www.ipqualityscore.com/create-account
https://www.ipqualityscore.com/plans
https://rapidapi.com/DataCrawler/api/truecaller4/pricing
https://www.truecaller.com/terms-of-service
https://docs.truecaller.com/truecaller-sdk/llms-full.txt

- Region: Veriphone returned India, IPQS city unavailable/region India. DataCrawler city field contained street-style data and is excluded. Filter city/state values with street terms/digits; no physical address/zip/email returned. Labels explicitly say reported/numbering region, not live location.
