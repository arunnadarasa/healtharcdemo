# Clinical Arc Slide Deck Content

This file contains two presentation tracks:

1. **Technical audience deck** (engineering, product, platform, architecture)  
2. **VC audience deck** (investors, partners, strategic stakeholders)

Use as speaker-ready content in Slides, Keynote, Pitch, or Lovable.

---

## Deck A - Technical Audience

### Slide 1 - Title
**Title:** Clinical Arc: HealthTech Intelligence + x402 Micropayments  
**Subtitle:** OpenEHR, SNOMED CT, dm+d, Arc Testnet, USDC  
**Presenter note:** This is a live reference architecture for usage-based healthcare APIs.

---

### Slide 2 - Problem for Engineering Teams
**Title:** Healthcare APIs are hard to monetize transparently  
**Bullets:**
- Pricing is often flat-rate and disconnected from per-request compute
- API value is high, but payment evidence is fragmented
- Agentic workflows need machine-native payment semantics
- Teams need both human UX and API-first payment control

---

### Slide 3 - What Clinical Arc Is
**Title:** A working reference app, not a concept  
**Bullets:**
- React + TypeScript frontend with role-based healthcare intelligence pages
- Node/Express backend with payment-gated endpoints
- Wallet modes for MetaMask and Circle developer wallets
- Integrated transaction logging for observability and demos

---

### Slide 4 - Architecture Overview
**Title:** Four-layer architecture  
**Bullets:**
- **Experience layer:** NHS hub and intelligence pages
- **API layer:** `/api/neighbourhood/*`, `/api/snomed/*`, `/api/dmd/*`, `/api/openehr/*`
- **Payments layer:** x402 challenge-response with USDC settlement paths
- **Data layer:** synthetic HES, SNOMED lookup, dm+d intelligence workflows

---

### Slide 5 - Key Product Surfaces
**Title:** Intelligence pages in the demo  
**Bullets:**
- Neighbourhood health insights (aggregates + paid summaries)
- HES at scale (FTS search + cross-dataset summary)
- NHS UK dataset lane (CSV-grounded retrieval + synthesis with precision controls)
- SNOMED intelligence (lookup, indexed search, summary)
- dm+d intelligence (free lookup + paid enrichment and paid summary)
- CDR lane (Confidential Data Rails vault lifecycle demo)
- CDR onboarding helpers (one-click license check/issue for current Circle/MetaMask wallet)

---

### Slide 6 - Payment Model
**Title:** Per-request monetization with x402  
**Bullets:**
- API can return `402 Payment Required` for premium endpoints
- Client resolves payment requirement and retries request
- Baseline demo pricing uses low-cost per-call model (e.g., $0.01)
- Supports usage-based billing for human and agent callers

---

### Slide 7 - Wallet and Settlement Flows
**Title:** Dual wallet UX for realistic integration  
**Bullets:**
- MetaMask mode for direct wallet interactions
- Circle mode for server-managed developer wallet flows
- Gateway top-up path for Circle batching semantics
- Consistent facilitator selection across client and server logic

---

### Slide 8 - Why This Matters for Agents
**Title:** API economics for agentic workloads  
**Bullets:**
- Agents can call the same paid endpoints as users
- Per-request pricing aligns with autonomous task volume
- Improves spend accountability at request granularity
- Enables API businesses beyond seat-based pricing

---

### Slide 9 - Data and Safety Posture
**Title:** Demo-safe by design  
**Bullets:**
- Uses synthetic/non-clinical data for hackathon and prototyping
- Explicitly not a clinical decision support product
- Designed to be adapted with governance controls in production
- Clean separation between demo patterns and compliance implementation

---

### Slide 10 - Observability and Operations
**Title:** Traceability across request, payment, and UI  
**Bullets:**
- Page-level transaction logs with wallet mode context
- Endpoint-level paid call visibility
- Explorer links for chain evidence when available
- Clear distinction between wallet balance and Gateway balance
- Clear separation of free vs paid output panes for faster operator UX
- Explicit 403 reason mapping for token-license denials (holder/scope/license state)

---

### Slide 11 - CDR + IPFS Extension
**Title:** Confidential files with Pinata-backed IPFS storage  
**Bullets:**
- `encrypt-store` supports plaintext and file-upload payload modes
- File uploads pin to IPFS via Pinata with `cid`, `ipfsUri`, and gateway URL
- Optional NFT-style metadata JSON generates token URI-compatible objects
- UI renders clickable `gatewayUrl`, `ipfs://`, and `tokenUri` links
- Keeps x402 paid lifecycle while adding interoperable data pointers

---

### Slide 12 - Integration Strategy
**Title:** Build fast, swap components safely  
**Bullets:**
- Route-based modular architecture for new intelligence domains
- Environment-driven integration configuration
- Works with OpenAPI discovery endpoint (`/openapi.json`)
- Supports adding new paid endpoints without redesigning core UX

---

### Slide 13 - Runtime Debug Learnings
**Title:** Runtime evidence changed our implementation decisions  
**Bullets:**
- Verified SNOMED URI usage was correct (`http://snomed.info/sct`), while failures came from content/version state
- Added dm+d fallback matching (case/query variants) after observing strict upstream exact-match behavior
- Fixed dm+d `invalid_signature` in MetaMask + Thirdweb by wiring `/api/dmd/*` into facilitator resolution + settlement middleware
- Removed stale inherited input fields (`LSOA`) when moving NHS UK synthesis to CSV-grounded lane
- Separated infra health checks from terminology-content correctness checks
- Captured operational evidence through endpoint-level diagnostics and response metadata

---

### Slide 14 - Technical Close
**Title:** What teams can do next  
**Bullets:**
- Fork and customize route surfaces for your datasets
- Replace demo summarization with your own model stack
- Introduce identity/roles and policy enforcement
- Move from testnet prototype to production controls
**CTA:** Start from `healtharcdemo` and ship your first paid intelligence endpoint.

---

## Deck B - VC Audience

### Slide 1 - Title
**Title:** Clinical Arc  
**Subtitle:** The infrastructure layer for usage-based HealthTech APIs  
**Tagline:** Healthcare intelligence that charges per request, not per contract.

---

### Slide 2 - Market Pain
**Title:** Healthcare software monetization is mispriced  
**Bullets:**
- Most tools sell annual licenses, not real usage
- AI-driven API demand is rising, but payment rails lag behind
- Buyers want measurable value and transparent spend
- Providers need new revenue models for data/compute products

---

### Slide 3 - Our Thesis
**Title:** Per-call economics will define next-gen HealthTech APIs  
**Bullets:**
- AI agents and automation call APIs continuously
- Per-seat pricing breaks under machine-scale usage
- Payment-native APIs unlock better unit economics
- Clinical Arc proves this model is feasible today

---

### Slide 4 - Product
**Title:** Clinical Arc in one sentence  
**Bullets:**
- A working platform for healthcare intelligence workflows with built-in micropayment gating
- Delivers SNOMED, dm+d, neighbourhood insights, and NHS UK OpenGPT dataset lane in one system
- Supports both enterprise UX and API-first monetization paths

---

### Slide 5 - Why Now
**Title:** Timing is favorable  
**Bullets:**
- Agentic software is shifting demand from seats to calls
- Payment rails for API-level charging are maturing
- Healthcare data products are under pressure to show ROI
- Builders need open reference architectures, not closed platforms

---

### Slide 6 - Business Model
**Title:** Revenue scales with real usage  
**Bullets:**
- Core model: paid premium API calls
- Upsell path: enterprise deployments and private integrations
- Value capture aligns with compute and decision-support depth
- Clear meter for gross margin management at endpoint level

---

### Slide 7 - Differentiation
**Title:** Why this is not another dashboard  
**Bullets:**
- Payment model is embedded in API behavior
- Built for both people and autonomous agents
- Verifiable usage trail for trust and procurement
- Open, modular architecture enables rapid vertical expansion

---

### Slide 8 - Early Wedge
**Title:** Initial adoption wedge  
**Bullets:**
- Hackathon and innovation teams needing demoable payment-native APIs
- HealthTech startups testing monetization before full enterprise rollout
- Platform teams seeking reusable architecture for paid endpoints
- B2B pilots where usage transparency shortens procurement cycles

---

### Slide 9 - Expansion Path
**Title:** From reference app to platform  
**Bullets:**
- Add new medical intelligence verticals on shared payment rails
- Integrate payer/provider-specific data pipelines
- Offer managed deployment and governance modules
- Build ecosystem of partner APIs priced per action

---

### Slide 10 - Risks and Mitigations
**Title:** Risk-aware by design  
**Bullets:**
- **Regulatory risk:** keep clinical-grade controls separate from demo runtime
- **Infra risk:** modular route architecture lowers migration cost
- **Payment dependency risk:** dual facilitator strategies reduce lock-in
- **Adoption risk:** start with measurable API ROI use cases

---

### Slide 11 - Execution Resilience
**Title:** We derisk by operating in the open  
**Bullets:**
- Converted real runtime issues into reusable reliability patterns
- Added transparent diagnostics for terminology and payment flows
- Corrected cross-route payment wiring issues quickly from live evidence (not assumptions)
- Reduced demo and pilot risk by proving recovery paths, not only happy paths
- Demonstrated ability to ship fixes quickly from evidence, not assumptions
- Added wallet-aware license issuance path to unblock first-run Circle wallet users

---

### Slide 12 - What Success Looks Like
**Title:** Target outcomes  
**Bullets:**
- Become the default architecture for pay-per-request HealthTech APIs
- Establish endpoint-level pricing as a standard commercial model
- Convert prototypes into production-grade enterprise instances
- Build recurring usage revenue with high transparency

---

### Slide 13 - VC Close
**Title:** Investment Narrative  
**Bullets:**
- Large market, broken pricing model, clear infrastructure gap
- Product already demonstrates technical and commercial feasibility
- Strong platform optionality across datasets and workflows
- Timing aligns with AI-agent adoption and API monetization shift
**CTA:** Partner with us to scale usage-based healthcare intelligence infrastructure.

---

## Optional Appendix Slides (for both decks)

### Appendix A - Demo Flow
- Connect wallet
- Run free intelligence call
- Trigger paid endpoint
- Show payment handling and response
- Verify transaction log and explorer reference

### Appendix B - Core Routes
- `/nhs/neighbourhood-insights`
- `/nhs/hes-scale`
- `/nhs/uk-dataset-lane`
- `/nhs/snomed-intelligence`
- `/nhs/dmd-intelligence`

### Appendix C - Suggested Demo Metrics to Track
- Paid calls per session
- Cost per successful paid request
- Time-to-first-paid-call
- Conversion from free to paid endpoints

