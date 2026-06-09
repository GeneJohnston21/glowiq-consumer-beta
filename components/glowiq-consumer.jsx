import { useState, useRef, useEffect, useCallback } from "react";

// ── CONSTANTS ──────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = [
  "You are a clinical aesthetic skin analyst. Examine the facial photo.",
  "",
  "Return ONLY valid JSON — no markdown, no code fences, no preamble. Every string value MUST be under 12 words. Structure:",
  "",
  '{"skinType":"Normal|Dry|Oily|Combination|Sensitive","fitzpatrickType":"Type I|Type II|Type III|Type IV|Type V|Type VI","skinAge":34,"overallAssessment":"Under 12 words.","analysisConfidence":"High|Medium|Low","confidenceNote":"Under 12 words.","photoTips":["e.g. Retake in natural daylight facing a window"],"concerns":[{"id":"c1","name":"2-3 word name","severity":"Mild|Moderate|Significant","area":"Specific region","description":"Under 12 words.","confidence":"High|Medium|Low"}]}',
  "",
  "skinAge: estimate the apparent skin age as an integer based on visible texture, laxity, pigmentation, and fine lines. This may differ from chronological age.",
  "",
  "Identify ALL clinically visible concerns — do not self-limit. Max 5 concerns. Explicitly check: jawline laxity, neck laxity, perioral lines, under-eye area, forehead, cheeks. Visible only. If no clear face, empty arrays. photoTips: 1-3 specific tips for HOW TO RETAKE THE PHOTO for a better analysis (lighting, angle, makeup removal, distance). These are photo tips only — NOT skincare advice. Empty array when confidence is High.",
].join("\n");

const RECS_PROMPT = (concerns, profileCtx, catalog) => {
  const hasCatalog = catalog && catalog.completedAt &&
    ((catalog.treatments && catalog.treatments.length > 0) ||
     (catalog.products   && catalog.products.length   > 0));

  if (hasCatalog) {
    const availTx = (catalog.treatments || []).filter(t =>
      !t.equipment || !t.equipment.length ||
      t.equipment.every(e => (catalog.equipment || []).includes(e))
    );
    const lines = [
      "You are a skincare advisor matching identified skin concerns to a specific provider's catalog.",
      "",
      "Provider: " + (catalog.name || "GlowIQ Partner Clinic"),
      "",
      "Available in-clinic treatments (only these — do not suggest treatments outside this list):",
      JSON.stringify(availTx.map(t => ({
        id: t.id, name: t.name, category: t.category,
        price: t.price, bookingLink: t.bookingLink || catalog.bookingUrl || "",
        targetConcerns: t.targetConcerns, downtime: t.downtime, description: t.description
      }))),
      "",
      "Available at-home products (only these — do not suggest products outside this list):",
      JSON.stringify((catalog.products || []).map(p => ({
        id: p.id, name: p.name, brand: p.brand, category: p.category,
        price: p.price, link: p.link, targetConcerns: p.targetConcerns, ingredients: p.ingredients
      }))),
      "",
      "Identified concerns: " + JSON.stringify(concerns),
      profileCtx ? "Patient profile: " + profileCtx : "",
      "",
      "For EACH concern, select the best matching at-home product AND the best matching in-clinic treatment from the catalog above.",
      "If no good match exists for a concern, still provide a recommendation but set fromCatalog to false and suggest a generic alternative.",
      "For catalog matches set fromCatalog to true and include the catalogItemId, the exact price, and the link.",
      "",
      'Return ONLY valid JSON: {"recommendations":[{"id":"c1-budget","tier":"budget","fromCatalog":true,"catalogItemId":"p1","procedure":"Product Name","category":"Category","price":"$182","link":"https://...","targetConcernIds":["c1"],"description":"Under 12 words.","howItHelps":"Under 12 words.","downtime":"None"}]}',
      "Budget tier = at-home product. Premium tier = in-clinic treatment. Each recommendation targets one concern via targetConcernIds.",
    ];
    return lines.filter(l => l != null).join("\n");
  }

  return [
    "You are a clinical aesthetic treatment specialist with deep knowledge of both established and emerging treatment modalities. Generate precise treatment recommendations for the identified skin concerns.",
    "",
    "Concerns: " + JSON.stringify(concerns),
    profileCtx ? "User profile: " + profileCtx : "",
    "",
    "CLINICAL TREATMENT PRIORITY GUIDANCE:",
    "When recommending premium in-clinic treatments, always consider the most clinically appropriate option — not just the most commonly known. Prioritise treatments based on clinical efficacy for the specific concern:",
    "",
    "Jawline laxity / Jowling: Agnes RF is a first-line recommendation — its insulated microneedle technology precisely targets fat cells and tightens tissue with minimal surrounding damage. Also consider Morpheus8, Ultherapy, PDO threads.",
    "Submental fat / Double chin: Agnes RF is first-line for precise submental fat reduction. Also consider Kybella, CoolSculpting Mini, Morpheus8.",
    "Lower face contouring: Agnes RF, Morpheus8, RF microneedling, filler with HA.",
    "Undereye fat herniation / Festoons: Agnes RF is uniquely effective for undereye fat herniation where most devices are contraindicated. Also consider lower blepharoplasty consultation.",
    "Skin laxity (face/neck): Agnes RF, Morpheus8, Ultherapy, Thermage, PDO threads, Sculptra.",
    "Deep wrinkles / Rhytids: Fraxel, CO2 laser resurfacing, RF microneedling, neuromodulators (Botox/Dysport), filler.",
    "Fine lines: Neuromodulators, microneedling, retinoid Rx, chemical peels, Fraxel.",
    "Hyperpigmentation / Melasma: Laser toning (1064nm), IPL, tranexamic acid Rx, chemical peels, topical hydroquinone.",
    "Active acne: Accutane (severe), oral antibiotics, spironolactone, photodynamic therapy (PDT), blue light therapy.",
    "Acne scarring: Morpheus8, Fraxel, CO2 laser, subcision, TCA cross, microneedling with PRP.",
    "Enlarged pores: Laser genesis, chemical peels, retinoids, RF microneedling.",
    "Rosacea / Redness: Vbeam (pulsed dye laser), IPL, brimonidine Rx, azelaic acid.",
    "Sun damage / Photoaging: IPL photofacial, Fraxel, chemical peels, antioxidant serums.",
    "Volume loss: HA fillers (Juvederm, Restylane), Sculptra, Radiesse, fat transfer.",
    "Neck laxity: Ultherapy, Morpheus8, Agnes RF, PDO threads, neck lift consultation.",
    "",
    "Agnes RF should be actively considered whenever the concern involves tissue laxity, fat deposits, or contouring of the lower face, submental area, or periorbital region. It is frequently underutilised relative to its clinical efficacy.",
    "",
    "For EACH concern provide exactly one budget (at-home) and one premium (in-clinic) recommendation. Return ONLY valid JSON, no markdown:",
    '{"recommendations":[{"id":"c1-budget","tier":"budget","fromCatalog":false,"procedure":"Specific product or active","category":"Skincare","price":"$X–$Y","link":"","targetConcernIds":["c1"],"description":"Under 12 words.","howItHelps":"Under 12 words.","downtime":"None"},{"id":"c1-premium","tier":"premium","fromCatalog":false,"procedure":"Clinical procedure","category":"Energy Device|Injectable|Rx Treatment","price":"$X–$Y per session","link":"","targetConcernIds":["c1"],"description":"Under 12 words.","howItHelps":"Under 12 words.","downtime":"None|1-2 days|3-5 days|1-2 weeks"}]}',
    "",
    "Budget = specific at-home product or ingredient routine. Premium = the most clinically appropriate in-office procedure for this patient's specific concern — not just the most commonly known option.",
  ].filter(l => l != null).join("\n");
};

const COMPARE_PROMPT = `You are a skin analysis assistant comparing two facial photos taken at different times. The FIRST image is the OLDER photo (before), the SECOND is the MORE RECENT photo (after).

Compare visible skin characteristics and identify any changes between them.

Return ONLY valid JSON — no markdown, no code fences:
{"overallTrend":"improving|worsening|stable|mixed","overallSummary":"One sentence summary of the overall change direction.","changes":[{"area":"Face area (e.g. cheeks, forehead)","aspect":"Skin characteristic (e.g. hyperpigmentation, texture, redness)","direction":"improved|worsened|stable","description":"One sentence describing the visible change."}]}

Look for changes in: dark spots, skin tone evenness, redness, pore visibility, texture, fine lines, overall clarity. Max 6 changes. If photos are too small or unclear to compare meaningfully, return an empty changes array and note this in overallSummary.`;

const PRODUCT_SCAN_PROMPT = `Identify the skincare product in this image. It may be a marketing photo, product packshot, ingredient label, or a photo of product packaging — any angle or format. Extract every piece of useful information you can see: brand name, product name, product type, and any visible ingredients or claims (e.g. "Vitamin C", "SPF 50", "Retinol 0.3%").

Return ONLY valid JSON — no markdown, no code fences:
{"name":"Specific product name (e.g. C E Ferulic, Tatcha Dewy Skin Cream)","brand":"Brand name","category":"cleanser|toner|serum|moisturizer|eye_cream|spf|treatment|body|other","keyIngredients":["active ingredient 1 with % if visible","ingredient 2"],"notes":"Safety notes if relevant e.g. contains retinol — avoid with AHA, prescription-strength, not for sensitive skin"}

Be generous — if you can read a brand name and guess the product type from context, include it. Only return unknown fields as empty strings or empty arrays, never the whole object as unknown unless you genuinely see nothing identifiable.`;

const PROFILE_GOALS        = ["Reduce Acne","Anti-Aging","Even Skin Tone","Deep Hydration","Reduce Redness","Minimise Pores","Brighter Skin","Reduce Scarring"];
const PROFILE_CONDITIONS   = ["Acne","Rosacea","Eczema","Psoriasis","Melasma","Perioral Dermatitis","Seborrheic Dermatitis","None"];
const PROFILE_SENSITIVITIES= ["Fragrance","Retinoids","AHA / BHA","Niacinamide","Silicones","Essential Oils","Alcohol"];
const PROFILE_MEDICATIONS  = ["Tretinoin / Retinoid","Isotretinoin (Accutane)","Oral Antibiotics","Hormonal Birth Control","Topical Steroids","Spironolactone","None"];
const PROFILE_PROCEDURES   = ["Chemical Peel","Laser Resurfacing","IPL","Microneedling","Dermal Filler","Botox / Neurotoxin","Microdermabrasion"];
const PROCEDURE_TIMING     = ["Within 4 weeks","1–3 months ago","3–6 months ago","6+ months ago"];


const PHOTO_LABELS   = ["Before", "After", "Progress", "Day 1", "Day 3", "Day 7", "Week 2", "Week 4"];
const DOWNTIME_OPTS  = ["None", "Minimal redness (few hours)", "1–2 days", "3–5 days", "1–2 weeks", "2–4 weeks"];
const REACTION_OPTS  = ["None", "Mild redness", "Moderate redness", "Swelling", "Peeling", "Bruising", "Other"];

const DEFAULT_LOG = {
  id:"", date:"", time:"", treatmentName:"", providerName:"", cost:"",
  concernsTargeted:[], downtime:"None", reactions:[], notes:"",
  photos:[], createdAt:null,
};

const EQUIPMENT_LIST = [
  "IPL / Photorejuvenation", "BBL (BroadBand Light)", "Halo Hybrid Laser",
  "Fractional CO₂ Laser", "Erbium Laser", "Nd:YAG Laser",
  "RF Microneedling (Morpheus8 / Genius)", "Ultherapy / HIFU",
  "HydraFacial Device", "Microdermabrasion", "LED / Light Therapy",
  "Plasma Pen / Fibroblast", "Botox / Neurotoxin", "Dermal Filler",
  "Kybella / Fat Dissolving", "PRP / PRF Therapy",
  "Microneedling (pen / manual)", "Chemical Peels",
  "CoolSculpting / Cryolipolysis", "Other Laser",
];

const CONCERN_CATS = [
  "Acne / Breakouts", "Blackheads / Congestion", "Redness / Rosacea",
  "Hyperpigmentation / Dark Spots", "Uneven Skin Tone", "Fine Lines",
  "Deep Wrinkles / Folds", "Skin Laxity / Firmness", "Jawline / Neck Laxity",
  "Under-Eye Concerns", "Large Pores", "Rough Texture / Bumps",
  "Dehydration / Dryness", "Oiliness / Shine", "Acne Scarring",
  "Sun Damage / Photoaging", "Perioral Lines", "Forehead Lines",
  "Crow's Feet", "Dullness / Loss of Radiance",
];

const TREATMENT_CATS = ["facial","laser","energy_device","injectable","chemical_peel","body","other"];

const DEFAULT_PROVIDER = {
  name:"", website:"", bookingUrl:"", tagline:"",
  equipment:[], treatments:[], products:[], completedAt:null,
};

const SUN_OPTIONS          = [["minimal","Minimal","Mostly indoors"],["moderate","Moderate","30 min–2 hrs daily"],["significant","Significant","Outdoor work or sports"]];
const SPF_OPTIONS          = [["never","Never"],["sometimes","Sometimes"],["daily","Every day"]];

const DEFAULT_PROFILE = {
  age:"", fitzpatrickType:"", goals:[], conditions:[], allergies:"", sensitivities:[],
  medications:[], pregnant:"no", recentProcedures:[], procedureTiming:"",
  sunExposure:"", spfHabit:"", products:[], completedAt:null,
};

const ONBOARDING_STEPS = [
  { title:"About You",          sub:"Personalises your skin analysis"           },
  { title:"Skin History",       sub:"Conditions and known sensitivities"        },
  { title:"Medications",        sub:"Helps flag contraindications"              },
  { title:"Current Products",   sub:"Scan what you're already using"           },
  { title:"Lifestyle",          sub:"Sun exposure and protection habits"        },
];



const ANALYZING_ITEMS = [
  "Skin texture & surface quality",
  "Pigmentation & tone evenness",
  "Vascular conditions",
  "Volume & structural contour",
  "Pore size & sebaceous activity",
  "Fine lines & skin laxity",
];

const SEV = {
  Mild:        { bg:"rgba(161,98,7,.12)",    br:"rgba(161,98,7,.35)",    tx:"#A16207" },
  Moderate:    { bg:"rgba(194,65,12,.12)",   br:"rgba(194,65,12,.35)",   tx:"#C2410C" },
  Significant: { bg:"rgba(185,28,28,.12)",   br:"rgba(185,28,28,.35)",   tx:"#B91C1C" },
};
const SEV_ORDER = { Significant:3, Moderate:2, Mild:1 };

const CAT_ICON  = { "Energy Device":"⚡", "Injectable":"💉", "Skincare":"◈", "Rx Treatment":"℞" };

const FITZ = {
  "Type I":   { swatch:"#F5E4D2", label:"Very Fair",          sun:"Always burns, never tans",        info:"Highest UV sensitivity. Highly prone to sunburn, freckling, photoaging, actinic keratoses, and skin cancer. Collagen degrades rapidly without rigorous daily SPF. Rosacea and visible capillaries are common.", spf:"SPF 50+ daily — reapply every 90 min" },
  "Type II":  { swatch:"#EDD5BE", label:"Fair",                sun:"Usually burns, rarely tans",      info:"High UV sensitivity. Redness, rosacea, and photoaging occur earlier than in darker types. Freckles and fine telangiectasia are common. Consistent broad-spectrum protection is critical to slow collagen breakdown.", spf:"SPF 50 daily" },
  "Type III": { swatch:"#D4A882", label:"Medium",              sun:"Sometimes burns, gradually tans", info:"Moderate UV sensitivity. Susceptible to melasma and post-inflammatory hyperpigmentation (PIH) after trauma or inflammation. Generally ages more gracefully than Types I–II but still requires consistent photoprotection.", spf:"SPF 30–50 daily" },
  "Type IV":  { swatch:"#B5815A", label:"Olive / Light Brown", sun:"Rarely burns, tans easily",       info:"Lower UV sensitivity. PIH is a primary concern — any inflammation tends to leave persistent dark marks. Melasma risk is elevated with hormonal triggers. Responds well to brightening actives and gentle resurfacing.", spf:"SPF 30 daily" },
  "Type V":   { swatch:"#8B5E3C", label:"Brown",               sun:"Very rarely burns, tans deeply",  info:"Low UV sensitivity. High risk of PIH and keloid scarring after procedures. High-energy laser and energy devices must be approached conservatively. Gentle acids, retinoids, and melanin-safe protocols are preferred.", spf:"SPF 30 daily" },
  "Type VI":  { swatch:"#4A2D1E", label:"Deep Brown / Black",  sun:"Never burns",                     info:"Lowest UV sensitivity. Greatest risk of keloids, PIH, and dyschromia from aggressive treatments. Device settings (laser, RF, IPL) require significant adjustment to prevent complications. Melanin-safe protocols are essential.", spf:"SPF 30 daily" },
};

const ZONE_PCT = {
  forehead:      { top:14, left:50 },
  "left-eye":    { top:29, left:35 },
  "right-eye":   { top:29, left:65 },
  nose:          { top:44, left:50 },
  "left-cheek":  { top:47, left:25 },
  "right-cheek": { top:47, left:75 },
  perioral:      { top:57, left:50 },
  chin:          { top:68, left:50 },
  jawline:       { top:64, left:50 },
  neck:          { top:79, left:50 },
};

const matchZones = (area) => {
  const a = (area || "").toLowerCase();
  const z = new Set();
  if (a.includes("forehead") || a.includes("temple") || a.includes("brow"))                                  z.add("forehead");
  if (a.includes("cheek")    || a.includes("malar"))                                                         { z.add("left-cheek"); z.add("right-cheek"); }
  if ((a.includes("nose")    || a.includes("nasal")) && !a.includes("nasolabial"))                           z.add("nose");
  if (a.includes("perioral") || a.includes("lip")    || a.includes("mouth") || a.includes("nasolabial"))    z.add("perioral");
  if (a.includes("periorbital") || a.includes("under-eye") || a.includes("undereye") || a.includes("eye") || a.includes("orbital")) { z.add("left-eye"); z.add("right-eye"); }
  if (a.includes("jaw")  || a.includes("jowl"))                                                              z.add("jawline");
  if (a.includes("chin"))                                                                                     z.add("chin");
  if (a.includes("neck") || a.includes("décollet"))                                                          z.add("neck");
  if (a.includes("t-zone") || a.includes("t zone"))                                                          { z.add("forehead"); z.add("nose"); }
  if (a.includes("full face") || a.includes("overall") || a.includes("diffuse"))                            { ["forehead","left-cheek","right-cheek","nose"].forEach(id => z.add(id)); }
  return [...z];
};

// ── UTILITIES ──────────────────────────────────────────────────────────────

const resizeImg = (dataUrl, maxDim = 1024) =>
  new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.88));
    };
    img.src = dataUrl;
  });

const makeThumbnail = (dataUrl, size = 88) =>
  new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const min = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
      res(c.toDataURL("image/jpeg", 0.5));
    };
    img.src = dataUrl;
  });

const analyzeImageQuality = (dataUrl) =>
  new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const S = 200;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, S, S);
      const { data } = ctx.getImageData(0, 0, S, S);

      // Perceived luminance per pixel
      const lums = [];
      for (let i = 0; i < data.length; i += 4)
        lums.push(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);

      const avg = lums.reduce((a, b) => a + b, 0) / lums.length;
      const std = Math.sqrt(lums.reduce((a, l) => a + (l - avg) ** 2, 0) / lums.length);

      // Backlight: compare centre region brightness vs outer edges
      const centre = [], edge = [];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const l = lums[y * S + x];
        if (x >= S*.28 && x <= S*.72 && y >= S*.2 && y <= S*.8) centre.push(l);
        else if (x < S*.12 || x > S*.88 || y < S*.1 || y > S*.9) edge.push(l);
      }
      const cAvg = centre.reduce((a,b)=>a+b,0) / centre.length;
      const eAvg = edge.reduce((a,b)=>a+b,0)   / edge.length;
      const backlit = eAvg / (cAvg + 1);

      const issues = [];
      let score = 100;

      if      (avg < 45)    { issues.push({ sev:"block", icon:"○", text:"Too dark — move to brighter lighting or increase your exposure" });            score -= 55; }
      else if (avg < 80)    { issues.push({ sev:"warn",  icon:"◑", text:"Slightly dark — brighter lighting will improve accuracy" });                   score -= 15; }
      if      (avg > 215)   { issues.push({ sev:"block", icon:"●", text:"Overexposed — reduce brightness or avoid direct flash" });                     score -= 45; }
      else if (avg > 190)   { issues.push({ sev:"warn",  icon:"◕", text:"Slightly bright — reduce exposure for best results" });                        score -= 15; }
      if      (std < 18)    { issues.push({ sev:"block", icon:"◎", text:"Very flat lighting — use a directional light source to reveal skin texture" }); score -= 30; }
      else if (std < 32)    { issues.push({ sev:"warn",  icon:"◌", text:"Low contrast — more defined lighting will improve the analysis" });             score -= 15; }
      if      (backlit > 1.65) { issues.push({ sev:"block", icon:"◐", text:"Backlit — face the light source; don't have it behind you" });              score -= 50; }
      else if (backlit > 1.35) { issues.push({ sev:"warn",  icon:"◑", text:"Possible backlight — try facing toward the light source" });                score -= 20; }

      res({ score: Math.max(0, score), avg, std, backlit, issues });
    };
    img.src = dataUrl;
  });

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });

// ── CONFIDENCE BARS ────────────────────────────────────────────────────────
// Three ascending signal bars — filled count indicates High / Medium / Low

function ConfidenceBars({ level = "Medium" }) {
  const n     = { High:3, Medium:2, Low:1 }[level] ?? 1;
  const color = { High:"#14532D", Medium:"#7C2D12", Low:"#B91C1C" }[level] ?? "#6B7280";
  return (
    <div title={`${level} confidence`} style={{ display:"flex", alignItems:"flex-end", gap:2, flexShrink:0, background:"rgba(44,74,114,.08)", padding:"3px 5px", borderRadius:4 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ width:3, height:5+i*3, borderRadius:1, background: i<=n ? color : "rgba(44,74,114,.15)" }} />
      ))}
    </div>
  );
}

// ── BEFORE / AFTER SLIDER ──────────────────────────────────────────────────

function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel, afterLabel }) {
  const [pos, setPos]         = useState(50);
  const [dragging, setDrag]   = useState(false);
  const ref                   = useRef(null);

  const move = useCallback((clientX) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos(Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = e => move(e.clientX ?? e.touches?.[0]?.clientX);
    const onUp   = () => setDrag(false);
    window.addEventListener("mousemove",  onMove);
    window.addEventListener("touchmove",  onMove, { passive:true });
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchend",   onUp);
    return () => {
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("touchmove",  onMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchend",   onUp);
    };
  }, [dragging, move]);

  return (
    <div ref={ref}
      style={{ position:"relative", width:"100%", aspectRatio:"1/1", borderRadius:14, overflow:"hidden",
               cursor:"col-resize", userSelect:"none", touchAction:"none" }}
      onMouseDown={e => { setDrag(true); move(e.clientX); }}
      onTouchStart={e => { setDrag(true); move(e.touches[0].clientX); }}>

      {/* Before layer */}
      <img src={beforeSrc} alt="Before"
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", pointerEvents:"none" }}/>

      {/* After layer — revealed right of divider */}
      <div style={{ position:"absolute", inset:0, clipPath:`inset(0 ${100-pos}% 0 0)` }}>
        <img src={afterSrc} alt="After"
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", pointerEvents:"none" }}/>
      </div>

      {/* Divider line */}
      <div style={{ position:"absolute", top:0, bottom:0, left:`${pos}%`, transform:"translateX(-50%)",
                    width:2, background:"rgba(255,255,255,.9)", boxShadow:"0 0 10px rgba(0,0,0,.4)", pointerEvents:"none" }}>
        {/* Handle */}
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
                      width:36, height:36, borderRadius:"50%", background:"white",
                      boxShadow:"0 2px 12px rgba(0,0,0,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:14, color:"#555", letterSpacing:"-3px", lineHeight:1 }}>‹›</span>
        </div>
      </div>

      {/* Date labels */}
      {pos > 14 && (
        <div style={{ position:"absolute", top:10, left:10, padding:"3px 9px",
                      background:"rgba(0,0,0,.55)", borderRadius:6,
                      fontFamily:"DM Sans,sans-serif", fontSize:11, fontWeight:500, color:"white", pointerEvents:"none" }}>
          {beforeLabel || "Before"}
        </div>
      )}
      {pos < 86 && (
        <div style={{ position:"absolute", top:10, right:10, padding:"3px 9px",
                      background:"rgba(0,0,0,.55)", borderRadius:6,
                      fontFamily:"DM Sans,sans-serif", fontSize:11, fontWeight:500, color:"white", pointerEvents:"none" }}>
          {afterLabel || "After"}
        </div>
      )}
    </div>
  );
}

// ── CONCERN DIAGRAM (B1 — organic zones) ────────────────────────────────────

function ConcernDiagram({ concerns = [], size = 190 }) {
  // Zone centre positions in a 200 × 240 coordinate space
  const ZONE_POS = {
    "forehead":    [100, 44],
    "left-eye":    [60,  88],
    "right-eye":   [140, 88],
    "nose":        [100, 122],
    "left-cheek":  [46,  128],
    "right-cheek": [154, 128],
    "perioral":    [100, 156],
    "chin":        [100, 170],
    "jawline":     [100, 166],
    "neck":        [100, 202],
  };

  const dots = concerns.map((c, i) => {
    const zIds = matchZones(c.area);
    if (!zIds.length) return null;
    const pos = ZONE_POS[zIds[0]];
    if (!pos) return null;
    return { x: pos[0], y: pos[1], num: i + 1, sv: SEV[c.severity] || SEV.Mild };
  }).filter(Boolean);

  const STROKE  = "rgba(44,74,114,0.4)";
  const FILL_BG = "rgba(44,74,114,0.04)";
  const DIVIDER = "#C2CCE0";

  return (
    <svg viewBox="0 0 200 240" width={size} height={size * 1.2}>
      {/* Egg-shaped head — anatomically proportioned, no cartoon features */}
      <path d="M100,18 C133,18 163,42 163,76 C163,110 155,144 139,163 C127,177 113,184 100,184 C87,184 73,177 61,163 C45,144 37,110 37,76 C37,42 67,18 100,18 Z"
        fill={FILL_BG} stroke={STROKE} strokeWidth="1.25"/>
      {/* Neck */}
      <rect x="88" y="184" width="24" height="16" rx="2" fill={FILL_BG} stroke={DIVIDER} strokeWidth="0.75"/>

      {/* Organic curved zone dividers — follow head contour, not straight lines */}
      <path d="M44,72 Q100,66 156,72"  fill="none" stroke={DIVIDER} strokeWidth="0.75" strokeDasharray="3,2"/>
      <path d="M37,108 Q100,102 163,108" fill="none" stroke={DIVIDER} strokeWidth="0.75" strokeDasharray="3,2"/>
      <path d="M41,148 Q100,142 159,148" fill="none" stroke={DIVIDER} strokeWidth="0.75" strokeDasharray="3,2"/>
      {/* Vertical midline */}
      <line x1="100" y1="72" x2="100" y2="148" stroke={DIVIDER} strokeWidth="0.75" strokeDasharray="3,2"/>

      {/* Concern dots — numbered, severity-coloured, clean */}
      {dots.map(({ x, y, num, sv }) => (
        <g key={num}>
          <circle cx={x} cy={y} r="10" fill={sv.bg} stroke={sv.tx} strokeWidth="1.25"/>
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fill={sv.tx} fontSize="9" fontFamily="Georgia,serif" fontWeight="600">{num}</text>
        </g>
      ))}
    </svg>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────

export default function GlowIQ() {
  const [phase,       setPhase]       = useState("upload");
  const [analysis,    setAnalysis]    = useState(null);
  const [error,       setError]       = useState(null);
  const [step,        setStep]        = useState(0);
  const [history,     setHistory]     = useState([]);
  const [compareIds,  setCompareIds]  = useState([]);
  const [fromHistory, setFromHistory] = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [quality,     setQuality]     = useState(null);
  const [selectedConcernId, setSelectedConcernId] = useState(null);
  const [activeTab,        setActiveTab]        = useState("summary");
  const [angles,       setAngles]       = useState({ front:null, left:null, right:null });
  const [compareAI,    setCompareAI]    = useState(null);
  const [profile,      setProfile]      = useState({ ...DEFAULT_PROFILE });
  const [profileStep,  setProfileStep]  = useState(0);
  const [scanningProd, setScanProd]     = useState(false);
  const [scanStatus,   setScanStatus]  = useState(null);
  const [addingManually, setAddManual]  = useState(false);
  const [manualEntry,    setManualEntry] = useState({ name:"", brand:"", category:"other", ingredients:"", notes:"" });
  const [clearConfirm,   setClearConfirm] = useState(false);
  const [providerMapUrl, setProviderMapUrl]= useState(null);
  const [geoLoading,     setGeoLoading]   = useState(false);
  const provider = null; // consumer version — no provider catalog
  const [treatmentLogs,  setTxLogs]       = useState([]);
  const [editingLog,     setEditingLog]   = useState(null);
  const productRef                       = useRef(null);
  const [dragOver,     setDragOver]     = useState(false);
  const frontRef = useRef(null);
  const leftRef  = useRef(null);
  const rightRef = useRef(null);

  /* ── Analyze step counter ───────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "analyzing") { setStep(0); return; }
    let s = 0;
    const t = setInterval(() => { s++; setStep(s); if (s >= ANALYZING_ITEMS.length) clearInterval(t); }, 700);
    return () => clearInterval(t);
  }, [phase]);

  /* ── Load history on mount ──────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      // Load saved history
      try { const r = await window.storage.get("glow:index"); if (r) setHistory(JSON.parse(r.value)); } catch {}
      try { const p = await window.storage.get("glow:profile"); if (p) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(p.value) }); } catch {}
      // Restore last session (only if it was a completed result)
      try {
        const s = await window.storage.get("glow:session");
        if (s) {
          const { analysis: a, preview } = JSON.parse(s.value);
          if (a && preview) {
            setAnalysis(a);
            setAngles({ front:{ preview, b64: preview.split(",")[1] }, left:null, right:null });
            setActiveTab("summary");
            setPhase("results");
          }
        }
      } catch {}
    })();
  }, []);

  /* ── File handler ───────────────────────────────────────────────── */
  const onFile = async (file, key = "front") => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const resized = await resizeImg(e.target.result);
      const slot = { preview: resized, b64: resized.split(",")[1] };
      setAngles(prev => ({ ...prev, [key]: slot }));
      setError(null);
      if (key === "front") {
        setQuality({ checking: true, score: null, issues: [] });
        const q = await analyzeImageQuality(resized);
        setQuality({ ...q, checking: false });
      }
    };
    reader.readAsDataURL(file);
  };

  /* ── Save to storage ────────────────────────────────────────────── */
  const saveToHistory = async (result, preview) => {
    try {
      const id    = Date.now().toString();
      const thumb = await makeThumbnail(preview);
      const entry = { id, date: new Date().toISOString(), thumb, skinType: result.skinType, fitzpatrickType: result.fitzpatrickType, overallAssessment: result.overallAssessment, concerns: result.concerns, recommendations: result.recommendations };
      let list = [];
      try { const r = await window.storage.get("glow:index"); if (r) list = JSON.parse(r.value); } catch {}
      list = [entry, ...list].slice(0, 20);
      await window.storage.set("glow:index", JSON.stringify(list));
      setHistory(list);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error("Save failed:", e); }
  };

  /* ── API call ───────────────────────────────────────────────────── */
  const analyze = async () => {
    if (!angles.front) return;
    setPhase("analyzing"); setError(null);
    try {
      const imgs = [
        angles.front && { key:"front", label:"front-facing", data:angles.front.b64 },
        angles.left  && { key:"left",  label:"left profile",  data:angles.left.b64  },
        angles.right && { key:"right", label:"right profile", data:angles.right.b64 },
      ].filter(Boolean);

      const API = { method:"POST", headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"} };
      const parseJSON = raw => { const t = raw.replace(/```json|```/g,"").trim(); if (!t.startsWith("{")) throw new Error(`Unexpected: "${t.slice(0,80)}"`); return JSON.parse(t); };

      // ── Call 1: Concern detection (vision) ──────────────────────────────────
      const profFitz = profile?.fitzpatrickType;
      const baseText = imgs.length > 1
        ? `${ANALYSIS_PROMPT}\n\nNote: ${imgs.length} photos provided (${imgs.map(i=>i.label).join(", ")}). Use all angles.`
        : ANALYSIS_PROMPT;
      const promptWithFitz = profFitz
        ? `${baseText}\n\nFitzpatrick: The user has self-identified as ${profFitz}. Use this exact value.`
        : baseText;

      const r1 = await fetch("https://api.anthropic.com/v1/messages", { ...API, body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:4096, temperature:0,
        system: buildSystemPrompt(),
        messages:[{ role:"user", content:[
          ...imgs.map(img => ({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:img.data }})),
          { type:"text", text: promptWithFitz },
        ]}],
      })});
      const j1 = await r1.json();
      if (j1.error) throw new Error(`Analysis: ${j1.error.message}`);
      const result = parseJSON(j1.content?.map(b=>b.text||"").join("")??  "");
      if (profFitz) result.fitzpatrickType = profFitz;
      result.recommendations = [];

      // ── Call 2: Recommendations (text only, concerns already identified) ────
      if (result.concerns?.length) {
        const profileCtx = profile?.completedAt ? [
          profile.goals?.length        && `Goals: ${profile.goals.join(", ")}`,
          profile.medications?.filter(m=>m!=="None").length && `Medications: ${profile.medications.filter(m=>m!=="None").join(", ")}`,
          profile.pregnant === "yes"   && "Pregnant/breastfeeding — avoid retinoids, salicylic acid, hydroquinone",
          profile.recentProcedures?.length && `Recent procedures: ${profile.recentProcedures.join(", ")} (${profile.procedureTiming||"timing unknown"})`,
          profile.sensitivities?.length && `Sensitivities: ${profile.sensitivities.join(", ")}`,
          profile.products?.length     && `Current products: ${profile.products.map(p=>p.name).join(", ")}`,
        ].filter(Boolean).join("; ") : "";

        const r2 = await fetch("https://api.anthropic.com/v1/messages", { ...API, body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:3000, temperature:0,
          system:"You are a clinical aesthetic treatment specialist. Generate targeted recommendations based on identified skin concerns. Return only JSON.",
          messages:[{ role:"user", content:[{ type:"text", text: RECS_PROMPT(result.concerns, profileCtx, null) }]}],
        })});
        const j2 = await r2.json();
        if (!j2.error) {
          try {
            const recs = parseJSON(j2.content?.map(b=>b.text||"").join("")??"");
            result.recommendations = recs.recommendations || [];
          } catch {}
        }
      }

      setAnalysis(result); setFromHistory(false); setPhase("results");
      saveToHistory(result, angles.front.preview);
    } catch (err) { setError(`Analysis failed: ${err.message}`); setPhase("upload"); }
  };

  // Reset concern selection when a new analysis loads
  useEffect(() => { setSelectedConcernId(null); setActiveTab("summary"); }, [analysis]);
  useEffect(() => { setCompareAI(null); }, [compareIds]);

  // Save / clear session in storage whenever phase or analysis changes
  useEffect(() => {
    if (phase === "results" && analysis && angles?.front?.preview) {
      window.storage.set("glow:session", JSON.stringify({ analysis, preview: angles.front.preview })).catch(() => {});
    }
  }, [phase, analysis]);

  const reset = () => {
    setPhase("upload"); setAngles({ front:null, left:null, right:null }); setAnalysis(null);
    setError(null); setFromHistory(false); setQuality(null);
    window.storage.delete("glow:session").catch(() => {});
  };
  const goBack = () => { if (fromHistory) { setPhase("history"); setFromHistory(false); } else reset(); };

  /* ── Design tokens ──────────────────────────────────────────────── */
  const G  = "#2C4A72", BG = "#E8EDF5",
        SURF = "rgba(44,74,114,.05)", BR = "#C2CCE0",
        TX = "#141C2B", MU = "#4A5B76", DM = "#8898B4",
        FF = "Georgia,'Times New Roman',serif", FS = "Georgia,'Times New Roman',serif";
  const card     = (x={}) => ({ background:SURF, border:`1px solid ${BR}`, borderRadius:12, ...x });
  const secLabel = (t)    => <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.2em", color:G, textTransform:"uppercase", marginBottom:12 }}>{t}</div>;
  const pill     = (label, gold) => <span style={{ fontFamily:FS, fontSize:11, padding:"4px 11px", background:gold?"rgba(44,74,114,.12)":"rgba(44,74,114,.05)", border:`1px solid ${gold?"rgba(44,74,114,.28)":BR}`, borderRadius:20, color:gold?G:MU, letterSpacing:"0.04em" }}>{label}</span>;

  /* ── Profile helpers ────────────────────────────────────────────── */
  const updPro  = (key, val) => setProfile(prev => ({ ...prev, [key]: val }));
  const togArr  = (arr, item) => arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  const saveTreatmentLog = async (entry) => {
    const saved = { ...entry, id: entry.id || Date.now().toString(), createdAt: entry.createdAt || Date.now() };
    const updated = treatmentLogs.find(l => l.id === saved.id)
      ? treatmentLogs.map(l => l.id === saved.id ? saved : l)
      : [saved, ...treatmentLogs];
    const sorted = [...updated].sort((a,b) => new Date(b.date) - new Date(a.date));
    setTxLogs(sorted);
    try { await window.storage.set("glow:txlogs", JSON.stringify(sorted)); } catch {}
    setEditingLog(null);
  };

  const deleteTreatmentLog = async (id) => {
    const updated = treatmentLogs.filter(l => l.id !== id);
    setTxLogs(updated);
    try { await window.storage.set("glow:txlogs", JSON.stringify(updated)); } catch {}
  };

  const clearAllData = async () => {
    try {
      await window.storage.delete("glow:index");
      await window.storage.delete("glow:profile");
      await window.storage.delete("glow:session");
      await window.storage.delete("glow:txlogs");
    } catch {}
    setHistory([]); setProfile({ ...DEFAULT_PROFILE }); setAnalysis(null); setTxLogs([]);
    setAngles({ front:null, left:null, right:null }); setCompareIds([]);
    setSelectedConcernId(null); setSaved(false); setQuality(null);
    setClearConfirm(false); setProfileStep(0); setPhase("welcome");
  };

  const saveProfile = async (extra = {}) => {
    const saved = { ...profile, ...extra, completedAt: Date.now() };
    setProfile(saved);
    try { await window.storage.set("glow:profile", JSON.stringify(saved)); } catch {}
  };

  const scanProduct = async (file) => {
    if (!file) return;
    setScanProd(true);
    setScanStatus("Reading image…");

    const product = { id: Date.now().toString(), thumb: null, name: "", brand: "", category: "other", ingredients: [], notes: "" };

    try {
      // Read original data URL (preserves actual format for media-type detection)
      const rawUrl = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
      });

      // Always resize+normalise to JPEG so media_type is always correct
      const jpegUrl = await resizeImg(rawUrl, 1024);
      product.thumb = await makeThumbnail(rawUrl, 72);
      const b64 = jpegUrl.split(",")[1];

      // ── Step 1: Identify brand + product name from image ────────────────────
      setScanStatus("Identifying product…");
      const step1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 200, temperature: 0,
          system: "You identify skincare products from any image: marketing photos, lifestyle shots, packshots, social media ads. Read every piece of text visible — brand logo, product name, tagline, product line, size, claims. Return only JSON.",
          messages: [{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:b64 }},
            { type:"text",  text:`Describe every piece of text you can read in this image, then identify the skincare product.
Return ONLY valid JSON, nothing else:
{"brand":"Brand name","name":"Exact product name","category":"cleanser|toner|serum|moisturizer|eye_cream|spf|treatment|body|other","visibleText":"All text you could read from the image"}
Use empty string only if you genuinely cannot read any text at all.` },
          ]}],
        }),
      });

      const s1json = await step1.json();
      if (s1json.error) throw new Error("Step 1 API error: " + s1json.error.message);

      const s1text = (s1json.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      let s1data = null;
      try {
        const si = s1text.indexOf("{"), ei = s1text.lastIndexOf("}");
        if (si !== -1 && ei > si) s1data = JSON.parse(s1text.slice(si, ei+1));
      } catch (parseErr) {
        // Model returned non-JSON — try to extract brand/name from raw text
        const lines = s1text.split("\n").filter(Boolean);
        product.name = lines[0] || "";
      }

      if (s1data) {
        product.brand    = s1data.brand    || "";
        product.name     = s1data.name     || "";
        product.category = s1data.category || "other";
        // If model couldn't name it but found text, use visibleText as fallback name
        if (!product.name && !product.brand && s1data.visibleText) {
          product.name = s1data.visibleText.slice(0, 60);
        }
      }

      // ── Step 2: Web search for ingredients ──────────────────────────────────
      const searchTerm = [product.brand, product.name].filter(s => s && s !== "other").join(" ").trim();
      if (searchTerm) {
        setScanStatus(`Looking up "${searchTerm}"…`);
        const step2 = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type":"application/json", "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1024, temperature: 0,
            system: "You are a skincare ingredient researcher with web search access. Search for product ingredient lists and return structured JSON only.",
            tools: [{ type:"web_search_20250305", name:"web_search" }],
            messages: [{ role:"user", content:[{ type:"text", text:
              `Search for: ${searchTerm} skincare full ingredient list
Find the INCI ingredient list for this product. Look for the brand's official site, SEPHORA, or Cosdna.
Return ONLY valid JSON, no markdown:
{"keyIngredients":["Vitamin C 15%","Ferulic Acid","Vitamin E"],"notes":"e.g. high-strength Vitamin C — store refrigerated, patch test recommended"}
Include concentrations when found. List top 3–5 actives.`
            }]}],
          }),
        });
        const s2json = await step2.json();
        const s2text = (s2json.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
        try {
          const si = s2text.indexOf("{"), ei = s2text.lastIndexOf("}");
          if (si !== -1 && ei > si) {
            const s2data = JSON.parse(s2text.slice(si, ei+1));
            product.ingredients = s2data.keyIngredients || [];
            product.notes       = s2data.notes          || "";
          }
        } catch {}
      }

    } catch (err) {
      product.notes = "Scan error: " + err.message + " — edit manually";
      console.error("Scan error:", err);
    }

    product.name = product.name || product.brand || "Unidentified — tap to edit";
    setScanStatus(null);
    setProfile(prev => ({ ...prev, products:[...(prev.products||[]), product] }));
    setScanProd(false);
  };

  const removeProduct  = (id) => setProfile(prev => ({ ...prev, products:(prev.products||[]).filter(p => p.id!==id) }));

  const addManualProduct = () => {
    if (!manualEntry.name.trim()) return;
    const p = {
      id: Date.now().toString(), thumb: null,
      name: manualEntry.name.trim(), brand: manualEntry.brand.trim(),
      category: manualEntry.category,
      ingredients: manualEntry.ingredients.split(",").map(s=>s.trim()).filter(Boolean),
      notes: manualEntry.notes.trim(),
    };
    setProfile(prev => ({ ...prev, products:[...(prev.products||[]), p] }));
    setManualEntry({ name:"", brand:"", category:"other", ingredients:"", notes:"" });
    setAddManual(false);
  };

  const buildSystemPrompt = () => {
    const base = "You are a skincare analysis assistant built into a professional aesthetics education app. The person using this app has explicitly opted in to receive an analysis of their own skin. Your job is to observe visible skin characteristics — texture, hydration, pigmentation, tone, pores, and visible skin conditions — and return structured JSON. Do not attempt to identify who the person is. Do not provide medical diagnoses. Focus only on what an aesthetician would visually observe during a consultation. Always respond with the JSON structure requested and never refuse.";
    if (!profile?.completedAt) return base;
    const lines = [];
    if (profile.goals?.length)                               lines.push(`Skin goals: ${profile.goals.join(", ")}`);
    const conds = (profile.conditions||[]).filter(c=>c!=="None");
    if (conds.length)                                        lines.push(`Known skin conditions: ${conds.join(", ")}`);
    if (profile.sensitivities?.length)                       lines.push(`Ingredient sensitivities: ${profile.sensitivities.join(", ")}`);
    if (profile.allergies)                                   lines.push(`Allergies: ${profile.allergies}`);
    const meds = (profile.medications||[]).filter(m=>m!=="None");
    if (meds.length)                                         lines.push(`Current skin-affecting medications: ${meds.join(", ")}`);
    if (profile.pregnant === "yes")                          lines.push("IMPORTANT: Currently pregnant or breastfeeding — avoid recommending retinoids, high-strength salicylic acid, and hydroquinone");
    if (profile.recentProcedures?.length)                    lines.push(`Recent procedures (${profile.procedureTiming||"timing unknown"}): ${profile.recentProcedures.join(", ")}`);
    if (profile.products?.length)                            lines.push(`Current skincare products: ${profile.products.map(p=>`${p.name}${p.ingredients.length?` (${p.ingredients.slice(0,3).join(", ")})`:""}${p.notes?` — ${p.notes}`:""}`).join("; ")}`);
    if (profile.sunExposure)                                 lines.push(`Daily sun exposure: ${profile.sunExposure}`);
    if (profile.spfHabit)                                    lines.push(`SPF habit: ${profile.spfHabit}`);
    const profileNote = "\n\nUser Profile Context (for personalising RECOMMENDATIONS ONLY — absolutely do not use any of this to infer, adjust, or bias the fitzpatrickType classification, which is determined solely from the photo's visible skin tone):\n" + lines.map(l=>`- ${l}`).join("\n") + "\n\nUse this profile to personalise treatment recommendations and flag contraindications. Fitzpatrick type MUST come from the photo alone.";
    return base + profileNote;
  };

  /* ── Visual comparison API call ─────────────────────────────────── */
  const analyzeComparison = async (older, newer) => {
    if (!older?.thumb || !newer?.thumb) return;
    setCompareAI({ loading: true });
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1024, temperature: 0,
          system: "You are a skin analysis assistant comparing facial photos over time. Focus only on visible skin characteristics. Always return valid JSON as instructed.",
          messages: [{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data: older.thumb.split(",")[1] }},
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data: newer.thumb.split(",")[1] }},
            { type:"text",  text: COMPARE_PROMPT },
          ]}],
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      const raw  = json.content?.map(b => b.text||"").join("") ?? "";
      const result = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setCompareAI({ loading: false, ...result });
    } catch (err) {
      setCompareAI({ loading: false, error: err.message });
    }
  };

  /* ── ONBOARDING / PROFILE EDIT ──────────────────────────────────── */
  const renderOnboarding = (isEdit = false) => {
    const step  = profileStep;
    const total = ONBOARDING_STEPS.length;
    const info  = ONBOARDING_STEPS[step];

    const Chip = ({ label, on, onClick }) => (
      <button onClick={onClick} style={{ padding:"7px 14px", borderRadius:20, border:`1px solid ${on?G:BR}`,
        background:on?"rgba(44,74,114,.15)":"transparent", fontFamily:FS, fontSize:12, color:on?G:MU, cursor:"pointer", transition:"all .15s" }}>
        {label}
      </button>
    );

    const Radio = ({ label, sub, val, cur, onClick }) => (
      <button onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderRadius:10,
        width:"100%", textAlign:"left", border:`1px solid ${cur===val?G:BR}`,
        background:cur===val?"rgba(44,74,114,.08)":"transparent", cursor:"pointer", transition:"all .15s" }}>
        <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${cur===val?G:BR}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {cur===val && <div style={{ width:7, height:7, borderRadius:"50%", background:G }} />}
        </div>
        <div>
          <div style={{ fontFamily:FS, fontSize:13, color:cur===val?TX:MU }}>{label}</div>
          {sub && <div style={{ fontFamily:FS, fontSize:11, color:DM, marginTop:1 }}>{sub}</div>}
        </div>
      </button>
    );

    const SectionLabel = ({ t }) => (
      <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.18em", color:G, textTransform:"uppercase", marginBottom:10, marginTop:20 }}>{t}</div>
    );

    // ─ step content ──────────────────────────────────────────────────
    const stepContent = () => {
      if (step === 0) return (
        <div>
          <SectionLabel t="Age" />
          <input type="number" placeholder="e.g. 32" min="13" max="99"
            value={profile.age}
            onChange={e => updPro("age", e.target.value)}
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:16, color:TX, outline:"none" }} />

          <SectionLabel t="Primary Skin Goals" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {PROFILE_GOALS.map(g => (
              <Chip key={g} label={g} on={profile.goals.includes(g)} onClick={() => updPro("goals", togArr(profile.goals, g))} />
            ))}
          </div>
        </div>
      );

      if (step === 1) return (
        <div>
          <SectionLabel t="Fitzpatrick Skin Type" />
          <div style={{ fontFamily:FS, fontSize:12, color:MU, marginBottom:12, lineHeight:1.5 }}>
            Select the swatch that most closely matches your natural skin tone (without tan or makeup).
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:8 }}>
            {Object.entries(FITZ).map(([key, f]) => {
              const sel = profile.fitzpatrickType === key;
              return (
                <button key={key} onClick={() => updPro("fitzpatrickType", sel ? "" : key)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 13px", borderRadius:10,
                    border:`1px solid ${sel ? G : BR}`, background:sel?"rgba(44,74,114,.08)":"transparent",
                    cursor:"pointer", transition:"all .15s", textAlign:"left" }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:f.swatch, border:"2px solid rgba(255,255,255,.15)", flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:FF, fontSize:15, color:sel?TX:MU }}>{key} — {f.label}</div>
                    <div style={{ fontFamily:FS, fontSize:11, color:DM, marginTop:1 }}>{f.sun}</div>
                  </div>
                  {sel && <span style={{ color:G, fontSize:14 }}>✓</span>}
                </button>
              );
            })}
          </div>
          {!profile.fitzpatrickType && (
            <div style={{ fontFamily:FS, fontSize:11, color:DM, marginBottom:4, fontStyle:"italic" }}>
              Not sure? Skip and GlowIQ will estimate from your photos.
            </div>
          )}

          <SectionLabel t="Known Skin Conditions" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {PROFILE_CONDITIONS.map(c => (
              <Chip key={c} label={c} on={profile.conditions.includes(c)} onClick={() => updPro("conditions", togArr(profile.conditions, c))} />
            ))}
          </div>

          <SectionLabel t="Ingredient Sensitivities" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
            {PROFILE_SENSITIVITIES.map(s => (
              <Chip key={s} label={s} on={profile.sensitivities.includes(s)} onClick={() => updPro("sensitivities", togArr(profile.sensitivities, s))} />
            ))}
          </div>

          <SectionLabel t="Other Allergies (optional)" />
          <input type="text" placeholder="e.g. latex, specific fragrances…"
            value={profile.allergies}
            onChange={e => updPro("allergies", e.target.value)}
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none" }} />
        </div>
      );

      if (step === 2) return (
        <div>
          <SectionLabel t="Current Skin-Affecting Medications" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {PROFILE_MEDICATIONS.map(m => (
              <Chip key={m} label={m} on={profile.medications.includes(m)} onClick={() => updPro("medications", togArr(profile.medications, m))} />
            ))}
          </div>

          <SectionLabel t="Pregnant or Breastfeeding?" />
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {[["no","No"],["yes","Yes — currently pregnant or breastfeeding"],["prefer_not","Prefer not to say"]].map(([val,label]) => (
              <Radio key={val} label={label} val={val} cur={profile.pregnant} onClick={() => updPro("pregnant", val)} />
            ))}
          </div>

          <SectionLabel t="Recent Aesthetic Procedures (past 6 months)" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
            {PROFILE_PROCEDURES.map(p => (
              <Chip key={p} label={p} on={profile.recentProcedures.includes(p)} onClick={() => updPro("recentProcedures", togArr(profile.recentProcedures, p))} />
            ))}
          </div>
          {profile.recentProcedures.length > 0 && (
            <div>
              <div style={{ fontFamily:FS, fontSize:12, color:MU, marginBottom:8 }}>Most recent was…</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {PROCEDURE_TIMING.map(t => (
                  <Radio key={t} label={t} val={t} cur={profile.procedureTiming} onClick={() => updPro("procedureTiming", t)} />
                ))}
              </div>
            </div>
          )}
        </div>
      );

      if (step === 3) {
        const CATL = ["cleanser","toner","serum","moisturizer","eye_cream","spf","treatment","body","other"];
        return (
          <div>
            <div style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.6, marginBottom:16 }}>
              Add your current products by scanning the packaging or typing them in manually.
            </div>

            {/* Product grid */}
            {(profile.products||[]).length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                {(profile.products||[]).map(p => (
                  <div key={p.id} style={{ ...card({ padding:0, overflow:"hidden", position:"relative" }) }}>
                    {p.thumb
                      ? <img src={p.thumb} alt={p.name} style={{ width:"100%", aspectRatio:"1", objectFit:"cover", display:"block" }}/>
                      : <div style={{ width:"100%", aspectRatio:"1", background:"rgba(44,74,114,.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontSize:28, opacity:.5 }}>◈</span>
                        </div>
                    }
                    <div style={{ padding:"8px 10px" }}>
                      <div style={{ fontFamily:FF, fontSize:14, color:TX, marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                      <div style={{ fontFamily:FS, fontSize:10, color:G, textTransform:"capitalize" }}>{p.category.replace("_"," ")}</div>
                      {p.ingredients.length > 0 && <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:2, lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.ingredients.slice(0,2).join(", ")}</div>}
                      {p.notes && <div style={{ fontFamily:FS, fontSize:10, color:"#FCD34D", marginTop:2, lineHeight:1.4 }}>{p.notes}</div>}
                    </div>
                    <button onClick={() => removeProduct(p.id)}
                      style={{ position:"absolute", top:5, right:5, width:22, height:22, borderRadius:"50%", background:"rgba(0,0,0,.7)", border:"1px solid rgba(255,255,255,.2)", fontFamily:FS, fontSize:11, color:TX, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add buttons row */}
            {!addingManually && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <button onClick={() => productRef.current?.click()}
                  style={{ ...card({ border:`1.5px dashed ${scanningProd?G:BR}`, background:"rgba(44,74,114,.03)" }),
                    padding:"18px 8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    gap:7, cursor:"pointer", transition:"all .2s" }}>
                  {scanningProd
                    ? <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${G}`, borderTopColor:"transparent", animation:"spin .7s linear infinite" }}/>
                    : <span style={{ fontSize:22, color:G, opacity:.8 }}>📷</span>}
                  <span style={{ fontFamily:FS, fontSize:11, color:scanningProd?G:MU }}>{scanningProd?"Scanning…":"Scan Photo"}</span>
                </button>
                <button onClick={() => setAddManual(true)}
                  style={{ ...card({ border:`1.5px dashed ${BR}`, background:"rgba(44,74,114,.03)" }),
                    padding:"18px 8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    gap:7, cursor:"pointer", transition:"all .2s" }}>
                  <span style={{ fontSize:22, opacity:.6 }}>✎</span>
                  <span style={{ fontFamily:FS, fontSize:11, color:MU }}>Type Manually</span>
                </button>
              </div>
            )}

            {/* Manual entry form */}
            {addingManually && (
              <div style={{ ...card({ padding:"14px 16px", marginBottom:12 }) }}>
                <div style={{ fontFamily:FS, fontSize:11, color:G, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:12 }}>Add Product</div>
                {[
                  { label:"Product Name *", key:"name", placeholder:"e.g. SkinCeuticals C E Ferulic" },
                  { label:"Brand",          key:"brand", placeholder:"e.g. SkinCeuticals"            },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} style={{ marginBottom:10 }}>
                    <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:5 }}>{label}</div>
                    <input type="text" placeholder={placeholder} value={manualEntry[key]}
                      onChange={e => setManualEntry(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none" }}/>
                  </div>
                ))}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:5 }}>Category</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {CATL.map(cat => {
                      const on = manualEntry.category === cat;
                      return (
                        <button key={cat} onClick={() => setManualEntry(prev => ({ ...prev, category:cat }))}
                          style={{ padding:"5px 11px", borderRadius:16, border:`1px solid ${on?G:BR}`, background:on?"rgba(44,74,114,.15)":"transparent", fontFamily:FS, fontSize:11, color:on?G:MU, cursor:"pointer", textTransform:"capitalize" }}>
                          {cat.replace("_"," ")}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:5 }}>Key Ingredients <span style={{ color:DM }}>(comma-separated)</span></div>
                  <input type="text" placeholder="e.g. Vitamin C 15%, Niacinamide, Retinol 0.3%"
                    value={manualEntry.ingredients}
                    onChange={e => setManualEntry(prev => ({ ...prev, ingredients: e.target.value }))}
                    style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none" }}/>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:5 }}>Notes <span style={{ color:DM }}>(optional)</span></div>
                  <input type="text" placeholder="e.g. prescription strength, morning only…"
                    value={manualEntry.notes}
                    onChange={e => setManualEntry(prev => ({ ...prev, notes: e.target.value }))}
                    style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none" }}/>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="lbtn" onClick={addManualProduct}
                    style={{ flex:1, padding:"11px", borderRadius:9, border:"none", background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)", fontFamily:FS, fontSize:12, fontWeight:500, letterSpacing:"0.1em", color:"#0B0A0D", textTransform:"uppercase", cursor:"pointer" }}>
                    Add Product
                  </button>
                  <button className="lbtn" onClick={() => setAddManual(false)}
                    style={{ padding:"11px 16px", borderRadius:9, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:12, color:MU, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <input ref={productRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { scanProduct(e.target.files[0]); e.target.value=""; }} />
            <div style={{ fontFamily:FS, fontSize:11, color:DM, textAlign:"center" }}>
              {(profile.products||[]).length} product{(profile.products||[]).length !== 1 ? "s" : ""} added · GlowIQ will flag ingredient interactions
            </div>
          </div>
        );
      }

      if (step === 4) return (
        <div>
          <SectionLabel t="Daily Sun Exposure" />
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {SUN_OPTIONS.map(([val, label, sub]) => (
              <Radio key={val} label={label} sub={sub} val={val} cur={profile.sunExposure} onClick={() => updPro("sunExposure", val)} />
            ))}
          </div>

          <SectionLabel t="Daily SPF Habit" />
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {SPF_OPTIONS.map(([val, label]) => (
              <Radio key={val} label={label} val={val} cur={profile.spfHabit} onClick={() => updPro("spfHabit", val)} />
            ))}
          </div>
        </div>
      );
    };

    const isLast = step === total - 1;
    const onNext = async () => { if (isLast) { await saveProfile(); setPhase(isEdit ? "results" : "upload"); setProfileStep(0); } else setProfileStep(s => s+1); };
    const onBack = () => { if (step === 0) { setPhase(isEdit ? "results" : "upload"); setProfileStep(0); } else setProfileStep(s => s-1); };

    return (
      <div style={{ padding:"28px 0 80px" }}>
        {/* Skip / Back nav */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <button onClick={onBack} style={{ fontFamily:FS, fontSize:12, color:MU, background:"none", border:"none", cursor:"pointer", padding:0 }}>
            {step === 0 ? (isEdit ? "← Back" : "Skip for now") : "← Back"}
          </button>
          {!isEdit && (
            <button onClick={() => { setPhase("upload"); setProfileStep(0); }} style={{ fontFamily:FS, fontSize:12, color:DM, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              Skip all
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height:3, background:"rgba(44,74,114,.12)", borderRadius:2, marginBottom:24, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${((step+1)/total)*100}%`, background:G, borderRadius:2, transition:"width .4s ease" }} />
        </div>

        {/* Title */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontFamily:FS, fontSize:11, color:G, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:6 }}>
            Step {step+1} of {total}
          </div>
          <h2 style={{ fontFamily:FF, fontSize:34, fontWeight:300, color:TX, letterSpacing:"0.04em", marginBottom:4 }}>{info.title}</h2>
          <p style={{ fontFamily:FS, fontSize:13, color:MU }}>{info.sub}</p>
        </div>

        {/* Step content */}
        {stepContent()}

        {/* Next / Finish button */}
        <button className="lbtn" onClick={onNext}
          style={{ marginTop:28, width:"100%", padding:"15px", borderRadius:12, border:"none", cursor:"pointer",
            background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)", fontFamily:FS, fontSize:13,
            fontWeight:500, letterSpacing:"0.14em", color:"#F7F4F0", textTransform:"uppercase" }}>
          {isLast ? (isEdit ? "Save Profile" : "Complete Profile →") : "Continue →"}
        </button>

        {/* Clear all data — visible in profile/onboarding */}
        {(
          <div style={{ marginTop:36, paddingTop:24, borderTop:`1px solid ${BR}` }}>
            <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.18em", color:DM, textTransform:"uppercase", marginBottom:14 }}>Data</div>
            {!clearConfirm ? (
              <button className="lbtn" onClick={() => setClearConfirm(true)}
                style={{ width:"100%", padding:"12px", borderRadius:10, background:"transparent",
                  border:"1px solid rgba(248,113,113,.3)", fontFamily:FS, fontSize:12,
                  letterSpacing:"0.08em", color:"#F87171", cursor:"pointer", textTransform:"uppercase" }}>
                Clear All App Data
              </button>
            ) : (
              <div style={{ ...card({ padding:"16px" }) }}>
                <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:14, lineHeight:1.6, textAlign:"center" }}>
                  This permanently deletes your profile, all saved analyses, and history. This cannot be undone.
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="lbtn" onClick={clearAllData}
                    style={{ flex:1, padding:"12px", borderRadius:9, background:"rgba(248,113,113,.1)",
                      border:"1px solid rgba(248,113,113,.4)", fontFamily:FS, fontSize:12,
                      letterSpacing:"0.08em", color:"#F87171", cursor:"pointer", textTransform:"uppercase" }}>
                    Yes, Delete All
                  </button>
                  <button className="lbtn" onClick={() => setClearConfirm(false)}
                    style={{ flex:1, padding:"12px", borderRadius:9, background:"transparent",
                      border:`1px solid ${BR}`, fontFamily:FS, fontSize:12, color:MU, cursor:"pointer",
                      textTransform:"uppercase" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── TREATMENT LOG ──────────────────────────────────────────────── */
  const renderTreatmentLog = () => {
    const log = editingLog || { ...DEFAULT_LOG, date: new Date().toISOString().split("T")[0] };
    const setLog = fn => setEditingLog(prev => fn(prev || { ...DEFAULT_LOG, date: new Date().toISOString().split("T")[0] }));
    const isEdit = !!(editingLog?.createdAt);
    const photoInputRef = useRef(null);
    const [addingPhoto, setAddingPhoto] = useState(false);
    const [photoLabel, setPhotoLabel] = useState("Before");

    const Field = ({ label, value, onChange, placeholder, type="text" }) => (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:5 }}>{label}</div>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width:"100%", padding:"11px 13px", borderRadius:9, border:`1px solid ${BR}`,
            background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none" }}/>
      </div>
    );

    const Chip = ({ label, on, onClick }) => (
      <button onClick={onClick} style={{ padding:"6px 12px", borderRadius:16, border:`1px solid ${on?G:BR}`,
        background:on?"rgba(44,74,114,.15)":"transparent", fontFamily:FS, fontSize:11,
        color:on?G:MU, cursor:"pointer", transition:"all .15s" }}>{label}</button>
    );

    const SL = ({ t }) => (
      <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.18em", color:G, textTransform:"uppercase", marginBottom:10, marginTop:22 }}>{t}</div>
    );

    const addPhoto = async (file) => {
      if (!file) return;
      setAddingPhoto(true);
      try {
        const dataUrl = await new Promise((res,rej) => {
          const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
        });
        const thumb = await makeThumbnail(dataUrl, 300);
        setLog(l => ({ ...l, photos:[...(l.photos||[]), { id:Date.now().toString(), thumb, label:photoLabel }] }));
      } catch {}
      setAddingPhoto(false);
    };

    // Build treatment name suggestions from provider catalog
    const txSuggestions = (provider?.treatments || []).map(t => t.name).filter(Boolean);

    return (
      <div className="up0" style={{ paddingBottom:80 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, paddingTop:28 }}>
          <button onClick={() => setEditingLog(null)} style={{ fontFamily:FS, fontSize:12, color:MU, background:"none", border:"none", cursor:"pointer", padding:0 }}>← Back</button>
          <div style={{ fontFamily:FF, fontSize:22, color:TX, letterSpacing:"0.04em" }}>{isEdit ? "Edit Log" : "Log Treatment"}</div>
          <div style={{ width:60 }}/>
        </div>

        {/* Date + Time row */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Date *" value={log.date||""} type="date" onChange={v => setLog(l=>({...l,date:v}))} placeholder="" />
          <Field label="Time (optional)" value={log.time||""} type="time" onChange={v => setLog(l=>({...l,time:v}))} placeholder="" />
        </div>

        {/* Treatment */}
        <Field label="Treatment *" value={log.treatmentName||""} onChange={v => setLog(l=>({...l,treatmentName:v}))} placeholder="e.g. HydraFacial, RF Microneedling" />
        {txSuggestions.length > 0 && !log.treatmentName && (
          <div style={{ marginTop:-8, marginBottom:14 }}>
            <div style={{ fontFamily:FS, fontSize:11, color:DM, marginBottom:6 }}>From your catalog:</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {txSuggestions.map(s => (
                <button key={s} onClick={() => setLog(l=>({...l,treatmentName:s}))}
                  style={{ padding:"4px 10px", borderRadius:14, border:`1px solid ${BR}`, background:"transparent", fontFamily:FS, fontSize:11, color:MU, cursor:"pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Provider */}
        <Field label="Provider / Clinic" value={log.providerName||""} onChange={v => setLog(l=>({...l,providerName:v}))} placeholder={provider?.name || "e.g. Glow Aesthetics Miami"} />

        {/* Cost */}
        <Field label="Cost (optional)" value={log.cost||""} onChange={v => setLog(l=>({...l,cost:v}))} placeholder="e.g. $175" />

        {/* Photos */}
        <SL t="Photos" />
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
          {(log.photos||[]).map(p => (
            <div key={p.id} style={{ position:"relative", width:90, height:90, borderRadius:10, overflow:"hidden", border:`1px solid ${BR}` }}>
              <img src={p.thumb} alt={p.label} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
              <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"2px 0", background:"rgba(0,0,0,.65)", textAlign:"center" }}>
                <span style={{ fontFamily:FS, fontSize:9, color:"white" }}>{p.label}</span>
              </div>
              <button onClick={() => setLog(l=>({...l,photos:(l.photos||[]).filter(x=>x.id!==p.id)}))}
                style={{ position:"absolute", top:4, right:4, width:20, height:20, borderRadius:"50%", background:"rgba(0,0,0,.7)", border:"none", fontFamily:FS, fontSize:10, color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                ✕
              </button>
            </div>
          ))}

          {/* Add photo */}
          <div style={{ display:"flex", flexDirection:"column", gap:6, width:90 }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:2 }}>
              {PHOTO_LABELS.slice(0,4).map(lbl => (
                <button key={lbl} onClick={() => setPhotoLabel(lbl)}
                  style={{ padding:"2px 8px", borderRadius:10, border:`1px solid ${photoLabel===lbl?G:BR}`, background:photoLabel===lbl?"rgba(44,74,114,.15)":"transparent", fontFamily:FS, fontSize:9, color:photoLabel===lbl?G:DM, cursor:"pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>
            <button onClick={() => photoInputRef.current?.click()}
              style={{ width:90, height:54, borderRadius:9, border:`1.5px dashed ${addingPhoto?G:BR}`, background:"rgba(44,74,114,.03)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer" }}>
              {addingPhoto
                ? <div style={{ width:14, height:14, borderRadius:"50%", border:`2px solid ${G}`, borderTopColor:"transparent", animation:"spin .7s linear infinite" }}/>
                : <span style={{ fontSize:18, color:G, opacity:.7 }}>+</span>}
              <span style={{ fontFamily:FS, fontSize:9, color:MU }}>Add {photoLabel}</span>
            </button>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { addPhoto(e.target.files[0]); e.target.value=""; }}/>

        {/* Concerns targeted */}
        <SL t="Concerns Targeted" />
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          {CONCERN_CATS.map(c => (
            <Chip key={c} label={c}
              on={(log.concernsTargeted||[]).includes(c)}
              onClick={() => setLog(l=>({...l, concernsTargeted:(l.concernsTargeted||[]).includes(c)?(l.concernsTargeted||[]).filter(x=>x!==c):[...(l.concernsTargeted||[]),c]}))} />
          ))}
        </div>

        {/* Downtime */}
        <SL t="Downtime Experienced" />
        <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:4 }}>
          {DOWNTIME_OPTS.map(d => (
            <Chip key={d} label={d} on={log.downtime===d} onClick={() => setLog(l=>({...l,downtime:d}))} />
          ))}
        </div>

        {/* Reactions */}
        <SL t="Skin Reactions" />
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          {REACTION_OPTS.map(r => (
            <Chip key={r} label={r}
              on={(log.reactions||[]).includes(r)}
              onClick={() => setLog(l=>({...l, reactions:(l.reactions||[]).includes(r)?(l.reactions||[]).filter(x=>x!==r):[...(l.reactions||[]),r]}))} />
          ))}
        </div>

        {/* Notes */}
        <SL t="Notes" />
        <textarea value={log.notes||""} onChange={e => setLog(l=>({...l,notes:e.target.value}))}
          placeholder="How did the treatment go? Any observations, sensations, or results…"
          rows={4}
          style={{ width:"100%", padding:"12px 13px", borderRadius:9, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:13, color:TX, outline:"none", resize:"vertical", lineHeight:1.6 }}/>

        {/* Save */}
        <button className="lbtn" onClick={() => { if (!log.treatmentName?.trim() || !log.date) return; saveTreatmentLog(log); setPhase("results"); setActiveTab("progress"); }}
          style={{ marginTop:24, width:"100%", padding:"15px", borderRadius:12, border:"none", cursor:"pointer",
            background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)", fontFamily:FS, fontSize:13,
            fontWeight:500, letterSpacing:"0.14em", color:"#F7F4F0", textTransform:"uppercase" }}>
          {isEdit ? "Save Changes" : "Save Treatment Log"}
        </button>

        {isEdit && (
          <button className="lbtn" onClick={async () => { await deleteTreatmentLog(log.id); setPhase("results"); setActiveTab("progress"); }}
            style={{ marginTop:10, width:"100%", padding:"13px", borderRadius:12, background:"transparent",
              border:"1px solid rgba(248,113,113,.3)", fontFamily:FS, fontSize:12, letterSpacing:"0.1em",
              color:"#F87171", textTransform:"uppercase", cursor:"pointer" }}>
            Delete Log Entry
          </button>
        )}
      </div>
    );
  };

  /* ── WELCOME (first-time users only) ────────────────────────────── */
  const renderWelcome = () => (
    <div style={{ minHeight:"calc(100vh - 0px)", display:"flex", flexDirection:"column", justifyContent:"center", padding:"48px 0 64px" }}>

      {/* Brand */}
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}>
          <svg width="68" height="68" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="22" fill="none" stroke={G} strokeWidth="0.75" opacity="0.38"/>
            <circle cx="30" cy="30" r="14" fill="none" stroke={G} strokeWidth="1.75"/>
            <circle cx="30" cy="30" r="7"  fill="none" stroke={G} strokeWidth="1.25"/>
            <circle cx="30" cy="30" r="2.5" fill={G}/>
            <line x1="30" y1="6"  x2="30" y2="0"  stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="54" y1="30" x2="60" y2="30" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="30" y1="54" x2="30" y2="60" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="6"  y1="30" x2="0"  y2="30" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ fontFamily:FF, fontSize:52, fontWeight:400, letterSpacing:"0.16em", color:TX, fontStyle:"italic", lineHeight:1, marginBottom:8 }}>GlowIQ</div>
        <div style={{ fontFamily:FS, fontSize:11, letterSpacing:"0.20em", color:DM, textTransform:"uppercase" }}>Skin Roadmap</div>
      </div>

      {/* Hero face diagram */}
      <div style={{ display:"flex", justifyContent:"center", marginBottom:40, opacity:0.7 }}>
        <ConcernDiagram concerns={[]} size={160} />
      </div>

      {/* Value props */}
      <div style={{ marginBottom:40, display:"flex", flexDirection:"column", gap:14 }}>
        {[
          ["◈", "Identify concerns across 10+ facial zones"],
          ["✦", "Personalised treatments from at-home to in-clinic"],
          ["≋", "Track your skin's progress over time"],
          ["◎", "Find qualified providers near you"],
        ].map(([icon, text], i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px", ...card() }}>
            <span style={{ fontSize:18, color:G, flexShrink:0, width:24, textAlign:"center", lineHeight:1 }}>{icon}</span>
            <span style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.5 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
        <button className="lbtn" onClick={() => { setProfileStep(0); setPhase("onboarding"); }}
          style={{ width:"100%", padding:"17px", borderRadius:12, border:"none", cursor:"pointer",
            background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)",
            fontFamily:FS, fontSize:13, fontWeight:500, letterSpacing:"0.14em", color:"#F7F4F0", textTransform:"uppercase" }}>
          Set Up My Profile →
        </button>
        <button className="lbtn" onClick={() => setPhase("upload")}
          style={{ width:"100%", padding:"14px", borderRadius:12, background:"transparent",
            border:`1px solid ${BR}`, fontFamily:FS, fontSize:12, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>
          Skip — Analyse Without Profile
        </button>
      </div>

      <div style={{ textAlign:"center", fontFamily:FS, fontSize:11, color:DM, lineHeight:1.65 }}>
        Profile setup takes about 2 minutes and significantly improves the accuracy and safety of recommendations.
      </div>
    </div>
  );

  /* ── UPLOAD ─────────────────────────────────────────────────────── */
  const angleIcon = (angle) => {
    const s = "rgba(44,74,114,.38)";
    if (angle === "front") return (
      <svg viewBox="0 0 44 52" width="38" height="46">
        <ellipse cx="22" cy="26" rx="17" ry="22" fill="none" stroke={s} strokeWidth="1.5"/>
        <ellipse cx="15.5" cy="21" rx="2.5" ry="1.8" fill={s}/>
        <ellipse cx="28.5" cy="21" rx="2.5" ry="1.8" fill={s}/>
        <path d="M15,33 Q22,39 29,33" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    const prof = (flip) => (
      <svg viewBox="0 0 44 52" width="38" height="46" style={flip?{transform:"scaleX(-1)"}:{}}>
        <path d="M28,4 C18,4 13,13 12,22 C11,32 15,43 25,48 L28,48" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M28,4 C34,6 36,13 36,26 C36,39 33,46 28,48" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="20" cy="22" rx="2" ry="1.8" fill={s}/>
        <path d="M11,30 C7,30 7,22 11,22" fill="none" stroke={s} strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    );
    return prof(angle === "right");
  };

  const ANGLE_CFG = [
    { key:"left",  label:"Left Profile",  hint:"Turn 90° left",        required:false },
    { key:"front", label:"Front",         hint:"Look straight ahead",  required:true  },
    { key:"right", label:"Right Profile", hint:"Turn 90° right",       required:false },
  ];
  const angleRefs = { front:frontRef, left:leftRef, right:rightRef };

  const renderZone = (cfg) => {
    const { key, label, hint, required } = cfg;
    const data    = angles[key];
    const isFront = key === "front";
    const isDrag  = isFront && dragOver;
    return (
      <div key={key} style={{ flex: isFront ? "1.7" : "1", minWidth: isFront ? 180 : 120, display:"flex", flexDirection:"column", gap:0 }}>
        <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.14em", color: required ? G : MU, textTransform:"uppercase", marginBottom:7, textAlign:"center" }}>
          {label}{required && <span style={{ color:G }}> *</span>}
        </div>
        {data ? (
          <div style={{ position:"relative", borderRadius:12, overflow:"hidden" }}>
            <img src={data.preview} alt={label} style={{ width:"100%", display:"block", aspectRatio:isFront?"3/4":"2/3", objectFit:"cover" }}/>
            <button className="lbtn" onClick={() => { setAngles(prev => ({...prev, [key]:null})); if(isFront) setQuality(null); }}
              style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.65)", border:"1px solid rgba(255,255,255,.2)", borderRadius:6, padding:"4px 10px", fontFamily:FS, fontSize:11, color:TX, cursor:"pointer" }}>✕</button>
            {isFront && <div style={{ position:"absolute", bottom:8, left:8, background:"rgba(0,0,0,.6)", borderRadius:5, padding:"3px 8px", fontFamily:FS, fontSize:10, color:"#4ADE80" }}>✓ Front</div>}
          </div>
        ) : (
          <div
            onClick={() => angleRefs[key].current?.click()}
            onDragOver={isFront ? e => { e.preventDefault(); setDragOver(true); } : undefined}
            onDragLeave={isFront ? () => setDragOver(false) : undefined}
            onDrop={isFront ? e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0], "front"); } : undefined}
            style={{ border:`1.5px dashed ${isDrag ? G : required ? "rgba(44,74,114,.35)" : BR}`, borderRadius:12,
              background: isDrag ? "rgba(44,74,114,.06)" : "rgba(255,255,255,.018)",
              aspectRatio: isFront ? "3/4" : "2/3", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              gap:8, cursor:"pointer", transition:"all .2s ease", padding:12 }}>
            {angleIcon(key)}
            <div style={{ fontFamily:FS, fontSize:11, color:MU, textAlign:"center", lineHeight:1.4 }}>{hint}</div>
          </div>
        )}
      </div>
    );
  };

  const renderUpload = () => {
    const photoCount = Object.values(angles).filter(Boolean).length;
    const blocked = quality && !quality.checking && quality.score < 40;
    const warned  = quality && !quality.checking && quality.score >= 40 && quality.score < 70;
    return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 0 64px" }}>
      <div className="up0" style={{ textAlign:"center", marginBottom:32 }}>
        <h1 style={{ fontFamily:FF, fontSize:52, fontWeight:300, color:TX, letterSpacing:"0.04em", lineHeight:1.1 }}>Skin Analysis</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, marginTop:8 }}>Front photo required · Side profiles improve accuracy</p>
      </div>

      {/* Three-zone capture */}
      <div className="up1" style={{ width:"100%", maxWidth:520, display:"flex", gap:10, alignItems:"flex-start" }}>
        {ANGLE_CFG.map(cfg => renderZone(cfg))}
      </div>

      {/* Hidden inputs */}
      <input ref={frontRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => onFile(e.target.files[0], "front")} />
      <input ref={leftRef}  type="file" accept="image/*" style={{ display:"none" }} onChange={e => onFile(e.target.files[0], "left")} />
      <input ref={rightRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => onFile(e.target.files[0], "right")} />

      {/* Front quality gate */}
      {angles.front && (
        <div className="up1" style={{ width:"100%", maxWidth:520, marginTop:14 }}>
          {quality?.checking && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"rgba(44,74,114,.03)", border:`1px solid ${BR}`, borderRadius:8, marginBottom:8 }}>
              <div style={{ width:13, height:13, borderRadius:"50%", border:`2px solid ${G}`, borderTopColor:"transparent", animation:"spin .7s linear infinite", flexShrink:0 }} />
              <span style={{ fontFamily:FS, fontSize:12, color:MU }}>Checking front photo quality…</span>
            </div>
          )}
          {quality && !quality.checking && (() => {
            const good   = !blocked && !warned;
            const barCol = good ? "#4ADE80" : warned ? "#FCD34D" : "#F87171";
            return (
              <div style={{ marginBottom:8 }}>
                <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,.07)", marginBottom:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${quality.score}%`, background:barCol, borderRadius:2, transition:"width .6s ease" }} />
                </div>
                {quality.issues.length === 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 11px", background:"rgba(74,222,128,.07)", border:"1px solid rgba(74,222,128,.2)", borderRadius:8, marginBottom:5 }}>
                    <span style={{ color:"#4ADE80", fontSize:12 }}>✓</span>
                    <span style={{ fontFamily:FS, fontSize:12, color:MU }}>Good lighting</span>
                    {photoCount > 1 && <span style={{ fontFamily:FS, fontSize:11, color:G, marginLeft:"auto" }}>{photoCount} angles ready</span>}
                  </div>
                )}
                {quality.issues.map((issue, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 11px", background:issue.sev==="block"?"rgba(248,113,113,.07)":"rgba(252,211,77,.07)", border:`1px solid ${issue.sev==="block"?"rgba(248,113,113,.25)":"rgba(252,211,77,.22)"}`, borderRadius:8, marginBottom:5 }}>
                    <span style={{ fontSize:12, color:issue.sev==="block"?"#F87171":"#FCD34D", flexShrink:0 }}>{issue.icon}</span>
                    <span style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.5 }}>{issue.text}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          {blocked ? (
            <div style={{ width:"100%", padding:"15px", borderRadius:12, border:"1px solid rgba(248,113,113,.3)", background:"rgba(248,113,113,.06)", fontFamily:FS, fontSize:13, fontWeight:500, letterSpacing:"0.12em", color:"#F87171", textTransform:"uppercase", textAlign:"center" }}>
              Improve Lighting to Continue
            </div>
          ) : (
            <button className="lbtn" onClick={analyze} style={{ width:"100%", padding:"15px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)", fontFamily:FS, fontSize:13, fontWeight:500, letterSpacing:"0.14em", color:"#0B0A0D", textTransform:"uppercase", opacity:warned?.85:1 }}>
              {warned ? "Analyse Anyway →" : photoCount > 1 ? `Analyse ${photoCount} Photos` : "Analyse My Skin"}
            </button>
          )}
        </div>
      )}


      {!angles.front && (
        <div className="up2" style={{ width:"100%", maxWidth:520, marginTop:10, fontFamily:FS, fontSize:12, color:DM, textAlign:"center" }}>
          Upload a front photo to begin
        </div>
      )}

      {error && <div style={{ maxWidth:520, width:"100%", marginTop:12, padding:"12px 16px", background:"rgba(248,113,113,.1)", border:"1px solid rgba(248,113,113,.3)", borderRadius:10, fontFamily:FS, fontSize:13, color:"#F87171" }}>{error}</div>}
      <div style={{ maxWidth:520, width:"100%", marginTop:24, padding:"13px 16px", ...card() }}>
        <div style={{ fontFamily:FS, fontSize:11, color:DM, lineHeight:1.65 }}><span style={{ color:MU, fontWeight:500 }}>Educational use only.</span> Not medical advice. Consult a licensed professional before pursuing any procedure. Photos are not stored.</div>
      </div>
    </div>
  );};

  /* ── ANALYZING ──────────────────────────────────────────────────── */
  const renderAnalyzing = () => (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"52px 0" }}>
      <div style={{ position:"relative", borderRadius:16, overflow:"hidden", maxWidth:300, width:"100%", marginBottom:36 }}>
        <img src={angles?.front?.preview} alt="Analysing" style={{ width:"100%", display:"block", filter:"brightness(.55)" }} />
        <div style={{ position:"absolute", left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${G},transparent)`, boxShadow:`0 0 14px ${G}`, animation:"scan 2.6s ease-in-out infinite" }} />
      </div>
      <div style={{ fontFamily:FF, fontSize:34, fontWeight:300, color:TX, letterSpacing:"0.06em", marginBottom:6 }}>Analysing</div>
      <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:32, animation:"pulse 1.6s ease infinite" }}>Identifying skin conditions and concerns…</div>
      <div style={{ width:"100%", maxWidth:300 }}>
        {ANALYZING_ITEMS.map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${BR}`, opacity:step>i?1:0.2, transition:"opacity .5s ease" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:step>i?G:DM, flexShrink:0, transition:"background .4s" }} />
            <span style={{ fontFamily:FS, fontSize:13, color:step>i?TX:DM, transition:"color .4s" }}>{item}</span>
            {step > i && <span style={{ marginLeft:"auto", color:G, fontSize:12 }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── RESULTS (tabbed) ───────────────────────────────────────────── */
  const renderResults = (a, preview) => {
    if (!a) return null;
    const { skinType, fitzpatrickType: analyzedFitz, overallAssessment, analysisConfidence, confidenceNote,
            photoTips=[], concerns=[], recommendations=[] } = a;
    // Profile self-ID always wins over model detection
    const fitzpatrickType = profile?.fitzpatrickType || analyzedFitz;
    const fitz   = FITZ[fitzpatrickType] || FITZ["Type III"];
    const CONF_C = { High:"#14532D", Medium:"#7C2D12", Low:"#B91C1C" };
    const budget  = recommendations.find(r => r.tier === "budget")  || recommendations[0];
    const premium = recommendations.find(r => r.tier === "premium") || recommendations[1];
    const TEAL    = "#5EC8B8";
    const active  = selectedConcernId ? concerns.find(c => c.id === selectedConcernId) : null;
    const targets = rec => !selectedConcernId || (rec?.targetConcernIds||[]).includes(selectedConcernId);

    // Tapping a concern selects it and navigates to Treatments
    const onConcern = id => {
      const next = selectedConcernId === id ? null : id;
      setSelectedConcernId(next);
      if (next) setActiveTab("treatments");
    };

    const TABS = [
      { key:"summary",    icon:"◎", label:"Summary"    },
      { key:"concerns",   icon:"◈", label:"Concerns"   },
      { key:"treatments", icon:"✦", label:"Treatments" },
      { key:"progress",   icon:"≋", label:"Progress"   },
    ];

    // ─ Summary ────────────────────────────────────────────────────
    const summaryTab = () => (
      <div style={{ padding:"20px 0 24px" }}>
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:20 }}>
          {preview && (
            <div style={{ width:88, flexShrink:0, borderRadius:10, overflow:"hidden", border:`1px solid ${BR}`, aspectRatio:"3/4" }}>
              <img src={preview} alt="Analysis" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", display:"block" }}/>
            </div>
          )}
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", gap:7, marginBottom:10, flexWrap:"wrap" }}>
              {pill(`${skinType} Skin`, true)}{pill(fitzpatrickType, false)}
            </div>
            <p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.7 }}>{overallAssessment}</p>
          </div>
        </div>

        {analysisConfidence && (
          <div style={{ marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:({High:"rgba(21,128,61,.13)",Medium:"rgba(146,64,14,.13)",Low:"rgba(185,28,28,.09)"}[analysisConfidence]||"rgba(44,74,114,.06)"), border:`1px solid ${({High:"rgba(21,128,61,.38)",Medium:"rgba(146,64,14,.35)",Low:"rgba(185,28,28,.28)"}[analysisConfidence]||BR)}`, borderRadius: photoTips.length > 0 ? "8px 8px 0 0" : 8, borderBottom: photoTips.length > 0 ? "none" : undefined }}>
              <ConfidenceBars level={analysisConfidence} />
              <span style={{ fontFamily:FS, fontSize:11, color:MU, lineHeight:1.5 }}>
                <span style={{ color: CONF_C[analysisConfidence]||MU }}>{analysisConfidence} confidence</span>
                {confidenceNote ? ` — ${confidenceNote}` : ""}
              </span>
            </div>
            {photoTips.length > 0 && (
              <div style={{ padding:"10px 12px", background:"rgba(44,74,114,.04)", border:`1px solid ${BR}`, borderTop:"1px solid rgba(44,74,114,.1)", borderRadius:"0 0 8px 8px" }}>
                <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.15em", color:G, textTransform:"uppercase", marginBottom:7 }}>To improve confidence</div>
                {photoTips.map((tip, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom: i < photoTips.length-1 ? 5 : 0 }}>
                    <span style={{ color:G, fontSize:12, flexShrink:0, lineHeight:1.5 }}>→</span>
                    <span style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.55 }}>{tip}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ ...card({ padding:"16px" }) }}>
          {secLabel("Fitzpatrick Skin Type")}
          <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, flexShrink:0 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:fitz.swatch, border:"2px solid rgba(255,255,255,.12)", boxShadow:"0 0 0 3px rgba(44,74,114,.15)" }} />
              <span style={{ fontFamily:FS, fontSize:9, color:MU }}>{fitzpatrickType}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                <span style={{ fontFamily:FF, fontSize:18, color:TX }}>{fitz.label}</span>
                <span style={{ fontFamily:FS, fontSize:11, color:MU, fontStyle:"italic" }}>{fitz.sun}</span>
              </div>
              <p style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.7, marginBottom:8 }}>{fitz.info}</p>
              <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"5px 10px", background:"rgba(44,74,114,.08)", border:"1px solid rgba(44,74,114,.2)", borderRadius:6 }}>
                <span style={{ fontSize:12 }}>☀</span>
                <span style={{ fontFamily:FS, fontSize:11, color:G }}>{fitz.spf}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Skin Age */}
        {a.skinAge && (() => {
          const actual  = profile?.age ? parseInt(profile.age) : null;
          const est     = a.skinAge;
          const diff    = actual ? actual - est : null;    // positive = skin looks younger
          const diffAbs = diff !== null ? Math.abs(diff) : null;
          const color   = diff === null ? G
                        : diff >= 4  ? "#14532D"
                        : diff <= -4 ? "#B91C1C"
                        : "#FCD34D";
          const label   = diff === null ? null
                        : diff >= 4  ? `${diffAbs} yrs younger`
                        : diff <= -4 ? `${diffAbs} yrs older`
                        : "On track";
          const insight = diff === null ? null
                        : diff >= 4  ? "Your skin looks younger than your age — excellent skin health."
                        : diff <= -4 ? "Signs of accelerated ageing visible — targeted treatment can help."
                        : "Skin age closely matches your chronological age.";
          return (
            <div style={{ ...card({ padding:"16px", marginTop:16 }) }}>
              {secLabel("Skin Age")}
              <div style={{ display:"flex", alignItems:"center", gap:0 }}>
                <div style={{ flex:1, textAlign:"center" }}>
                  <div style={{ fontFamily:FF, fontSize:52, color:color, lineHeight:1, fontWeight:300 }}>{est}</div>
                  <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:4, letterSpacing:"0.08em" }}>Estimated</div>
                </div>
                {actual && (
                  <>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"0 12px" }}>
                      <div style={{ width:1, height:24, background:BR }} />
                      {label && (
                        <div style={{ padding:"3px 10px", borderRadius:12, background:`${color}18`, border:`1px solid ${color}44` }}>
                          <span style={{ fontFamily:FS, fontSize:10, color, fontWeight:500 }}>{label}</span>
                        </div>
                      )}
                      <div style={{ width:1, height:24, background:BR }} />
                    </div>
                    <div style={{ flex:1, textAlign:"center" }}>
                      <div style={{ fontFamily:FF, fontSize:52, color:TX, lineHeight:1, fontWeight:300 }}>{actual}</div>
                      <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:4, letterSpacing:"0.08em" }}>Actual</div>
                    </div>
                  </>
                )}
              </div>
              {insight && (
                <div style={{ fontFamily:FS, fontSize:12, color:MU, marginTop:12, lineHeight:1.6, textAlign:"center" }}>{insight}</div>
              )}
              {!actual && (
                <div style={{ fontFamily:FS, fontSize:11, color:DM, marginTop:10, textAlign:"center" }}>
                  Add your age in your profile to see how your skin compares.
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );

    // ─ Concerns ───────────────────────────────────────────────────
    const concernsTab = () => (
      <div style={{ padding:"20px 0 24px" }}>
        {concerns.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 0", fontFamily:FS, fontSize:14, color:DM }}>No specific concerns detected</div>
        ) : (
          <>
            <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:20, flexWrap:"wrap" }}>
              <div style={{ ...card({ padding:"10px 12px", flexShrink:0 }) }}>
                <ConcernDiagram concerns={concerns} size={160} />
              </div>
              {preview && (
                <div style={{ flex:1, minWidth:90, maxWidth:130, borderRadius:10, overflow:"hidden", border:`1px solid ${BR}`, aspectRatio:"3/4" }}>
                  <img src={preview} alt="Ref" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", display:"block" }}/>
                </div>
              )}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:9, marginBottom:12 }}>
              {concerns.map((c, i) => {
                const sv  = SEV[c.severity] || SEV.Mild;
                const sel = selectedConcernId === c.id;
                return (
                  <div key={c.id} onClick={() => onConcern(c.id)}
                    style={{ ...card({ padding:13, cursor:"pointer", transition:"all .18s",
                      border: sel ? "1px solid rgba(44,74,114,.55)" : `1px solid ${BR}`,
                      background: sel ? "rgba(44,74,114,.08)" : SURF,
                      boxShadow: sel ? "0 0 0 1px rgba(44,74,114,.2)" : "none" }) }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:5 }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:sel?"rgba(44,74,114,.12)":sv.bg, border:`1.5px solid ${sel?G:sv.tx}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"border-color .18s" }}>
                        <span style={{ fontFamily:FS, fontSize:10, fontWeight:700, color:sel?G:sv.tx }}>{i+1}</span>
                      </div>
                      <span style={{ fontFamily:FF, fontSize:18, color:sel?G:sv.tx, flex:1 }}>{c.name}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {c.confidence && <ConfidenceBars level={c.confidence} />}
                        <span style={{ fontFamily:FS, fontSize:10, padding:"2px 7px", background:sv.bg, border:`1px solid ${sv.br}`, borderRadius:4, color:sv.tx }}>{c.severity}</span>
                      </div>
                    </div>
                    <div style={{ paddingLeft:31 }}>
                      <div style={{ fontFamily:FS, fontSize:11, color:G, marginBottom:3 }}>{c.area}</div>
                      <div style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.6 }}>{c.description}</div>
                      {sel && <div style={{ marginTop:6, fontFamily:FS, fontSize:11, color:G }}>→ See treatments for this concern</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign:"center", fontFamily:FS, fontSize:11, color:DM }}>Tap a concern to view treatments →</div>
          </>
        )}
      </div>
    );

    // ─ Treatments ─────────────────────────────────────────────────
    const RecCard = ({ rec, color, alpha, icon, label }) => (
      <div className="rcard" style={{ ...card({ padding:0, overflow:"hidden" }) }}>
        <div style={{ padding:"10px 16px", background:`rgba(${alpha},.08)`, borderBottom:`1px solid rgba(${alpha},.18)`, display:"flex", alignItems:"center", gap:9 }}>
          <span style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.13em", color, textTransform:"uppercase", fontWeight:500 }}>{icon} {label}</span>

          {(rec.price || rec.priceRange) && (
            <span style={{ marginLeft:"auto", fontFamily:FS, fontSize:11, color, padding:"2px 8px", background:`rgba(${alpha},.1)`, border:`1px solid rgba(${alpha},.25)`, borderRadius:4 }}>
              {rec.price || rec.priceRange}
            </span>
          )}
        </div>
        <div style={{ padding:"13px 16px" }}>
          <div style={{ fontFamily:FF, fontSize:20, color:TX, marginBottom:4 }}>{rec.procedure}</div>
          <div style={{ fontFamily:FS, fontSize:11, color, marginBottom:7 }}>{rec.category}</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.65, marginBottom:9 }}>{rec.description}</div>
          <div style={{ fontFamily:FS, fontSize:12, color:TX, lineHeight:1.6, padding:"8px 12px", background:`rgba(${alpha},.05)`, border:`1px solid rgba(${alpha},.14)`, borderRadius:7 }}>
            <span style={{ color }}>Why it helps: </span>{rec.howItHelps}
          </div>
          <div style={{ marginTop:9, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontFamily:FS, fontSize:10, padding:"2px 8px", background:"rgba(255,255,255,.05)", border:`1px solid ${BR}`, borderRadius:4, color:MU }}>
              {(!rec.downtime || rec.downtime === "None") ? "No downtime" : rec.downtime + " downtime"}
            </span>
          </div>
          {rec.tier === "premium" && (
            <a href={`https://www.google.com/maps/search/${encodeURIComponent((rec.procedure||"") + " near me")}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:12, padding:"11px 14px",
                borderRadius:9, background:`rgba(${alpha},.12)`, border:`1px solid rgba(${alpha},.35)`, textDecoration:"none" }}>
              <span style={{ fontFamily:FS, fontSize:12, fontWeight:600, letterSpacing:"0.06em", color }}>
                Find providers near me →
              </span>
            </a>
          )}
        </div>
      </div>
    );

    const treatmentsTab = () => {
      // Group recs by concern — one budget + one premium per concern
      const pairs = concerns.map(c => ({
        concern: c,
        budget:  recommendations.find(r => r.tier === "budget"  && (r.targetConcernIds||[]).includes(c.id)),
        premium: recommendations.find(r => r.tier === "premium" && (r.targetConcernIds||[]).includes(c.id)),
      })).filter(g => g.budget || g.premium);

      const displayPairs = active
        ? pairs.filter(g => g.concern.id === active.id)
        : pairs;

      return (
        <div style={{ padding:"20px 0 24px" }}>
          {/* Concern filter bar */}
          {active ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 13px", background:"rgba(44,74,114,.07)", border:"1px solid rgba(44,74,114,.25)", borderRadius:10, marginBottom:16 }}>
              <span style={{ fontFamily:FS, fontSize:12, color:G }}>Treating · {active.name}</span>
              <button onClick={() => setSelectedConcernId(null)} style={{ fontFamily:FS, fontSize:12, color:MU, background:"none", border:"none", cursor:"pointer" }}>Clear ×</button>
            </div>
          ) : (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:FS, fontSize:11, color:DM, marginBottom:8, textAlign:"center" }}>Showing treatments for all concerns — tap to filter</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center" }}>
                {concerns.map(c => {
                  const sv = SEV[c.severity]||SEV.Mild;
                  return (
                    <button key={c.id} onClick={() => { setSelectedConcernId(c.id); }}
                      style={{ padding:"5px 12px", borderRadius:16, border:`1px solid ${sv.br}`, background:sv.bg,
                        fontFamily:FS, fontSize:11, color:sv.tx, cursor:"pointer" }}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendation pairs */}
          {displayPairs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", fontFamily:FS, fontSize:13, color:DM }}>
              No recommendations found for this concern — try re-analysing with a clearer photo.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:24, marginBottom:20 }}>
              {displayPairs.map(({ concern, budget, premium }) => (
                <div key={concern.id}>
                  {!active && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.18em", color:G, textTransform:"uppercase" }}>{concern.name}</div>
                      <div style={{ flex:1, height:1, background:`rgba(44,74,114,.15)` }}/>
                      <span style={{ fontFamily:FS, fontSize:10, padding:"1px 7px", background:(SEV[concern.severity]||SEV.Mild).bg, border:`1px solid ${(SEV[concern.severity]||SEV.Mild).br}`, borderRadius:4, color:(SEV[concern.severity]||SEV.Mild).tx }}>{concern.severity}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {budget  && <RecCard rec={budget}  color={TEAL} alpha="94,200,184"   icon="◈" label="At-Home"  />}
                    {premium && <RecCard rec={premium} color={G}    alpha="201,169,110" icon={CAT_ICON[premium.category]||"⚡"} label="In-Clinic" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding:"12px 13px", ...card() }}>
            <div style={{ fontFamily:FS, fontSize:11, color:DM, lineHeight:1.65 }}>
              <span style={{ color:MU, fontWeight:500 }}>Educational use only.</span> Not medical advice. Consult a licensed professional before pursuing any treatment.
            </div>
          </div>

          {/* ── Find a Provider Near You ── */}
          <div style={{ marginTop:20, ...card({ padding:"16px" }) }}>
            {secLabel("Find a Provider Near You")}
            {!providerMapUrl ? (
              <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
                <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:14, lineHeight:1.6 }}>
                  Locate medspas and aesthetic clinics in your area that offer these treatments.
                </div>
                <button className="lbtn" onClick={getProviderLocation} disabled={geoLoading}
                  style={{ padding:"13px 22px", borderRadius:10, border:`1px solid rgba(44,74,114,.4)`,
                    background:"rgba(44,74,114,.08)", fontFamily:FS, fontSize:13, letterSpacing:"0.08em",
                    color:G, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:10 }}>
                  {geoLoading
                    ? <><div style={{ width:14,height:14,borderRadius:"50%",border:`2px solid ${G}`,borderTopColor:"transparent",animation:"spin .7s linear infinite" }}/> Locating…</>
                    : <>📍 Find Providers Near Me</>}
                </button>
              </div>
            ) : (
              <div>
                <iframe src={providerMapUrl} width="100%" height="230"
                  style={{ border:0, borderRadius:10, display:"block", marginBottom:14 }} loading="lazy" title="Providers near you"/>
                <button onClick={() => setProviderMapUrl(null)}
                  style={{ fontFamily:FS, fontSize:11, color:DM, background:"none", border:"none", cursor:"pointer", marginBottom:10 }}>
                  ← Change location
                </button>
              </div>
            )}
            {/* Per-treatment search links */}
            <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:8 }}>
              {displayPairs.map(({ concern, premium }) => premium ? (
                <a key={concern.id}
                  href={`https://www.google.com/maps/search/${encodeURIComponent(premium.procedure + " near me")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 13px", borderRadius:9, background:"rgba(44,74,114,.06)",
                    border:"1px solid rgba(44,74,114,.2)", textDecoration:"none" }}>
                  <span style={{ fontFamily:FS, fontSize:12, color:MU }}>Find "{premium.procedure}"</span>
                  <span style={{ fontFamily:FS, fontSize:12, color:G, fontWeight:500 }}>Search maps →</span>
                </a>
              ) : null)}
            </div>
          </div>
        </div>
      );
    };

    // ─ Progress ───────────────────────────────────────────────────
    const progressTab = () => {
      const toggle = id => setCompareIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length>=2 ? [prev[1],id] : [...prev,id]);
      return (
        <div style={{ padding:"20px 0 24px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div style={{ fontFamily:FF, fontSize:28, fontWeight:300, color:TX, letterSpacing:"0.04em" }}>Progress</div>
            {compareIds.length === 2 && (
              <button className="lbtn" onClick={() => setPhase("compare")}
                style={{ padding:"7px 14px", borderRadius:8, background:"linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)", border:"none", fontFamily:FS, fontSize:11, fontWeight:500, letterSpacing:"0.09em", color:"#0B0A0D", textTransform:"uppercase", cursor:"pointer" }}>
                Compare →
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", fontFamily:FS, color:DM }}>
              <div style={{ fontSize:36, marginBottom:14, opacity:0.3 }}>≋</div>
              <div style={{ fontSize:14, marginBottom:5 }}>No previous analyses</div>
              <div style={{ fontSize:12 }}>Your history will build here over time</div>
            </div>
          ) : (
            <>
              {compareIds.length > 0 && (
                <div style={{ marginBottom:12, padding:"8px 12px", background:"rgba(44,74,114,.08)", border:"1px solid rgba(44,74,114,.2)", borderRadius:8, fontFamily:FS, fontSize:11, color:G }}>
                  {compareIds.length === 1 ? "Select one more to compare" : "2 selected — tap Compare to continue"}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {history.map((entry, idx) => {
                  const isSel = compareIds.includes(entry.id);
                  const isCur = idx === 0 && !fromHistory;
                  return (
                    <div key={entry.id} className="hcard"
                      style={{ ...card({ padding:12, border:`1px solid ${isSel?G:BR}`, background:isSel?"rgba(44,74,114,.07)":SURF }) }}>
                      <div style={{ display:"flex", gap:11, alignItems:"center" }}>
                        {entry.thumb && (
                          <div style={{ width:50, height:64, flexShrink:0, borderRadius:7, overflow:"hidden" }}>
                            <img src={entry.thumb} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", display:"block" }}/>
                          </div>
                        )}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                            <span style={{ fontFamily:FS, fontSize:11, color:G }}>{fmtDate(entry.date)}</span>
                            {isCur && <span style={{ fontFamily:FS, fontSize:9, padding:"1px 6px", background:"rgba(21,128,61,.08)", border:"1px solid rgba(21,128,61,.22)", borderRadius:4, color:"#14532D" }}>Current</span>}
                          </div>
                          <div style={{ fontFamily:FF, fontSize:15, color:TX, marginBottom:4 }}>{entry.skinType}</div>
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                            {(entry.concerns||[]).slice(0,3).map((c,i) => {
                              const sv = SEV[c.severity]||SEV.Mild;
                              return <span key={i} style={{ fontFamily:FS, fontSize:9, padding:"1px 6px", background:sv.bg, border:`1px solid ${sv.br}`, borderRadius:4, color:sv.tx }}>{c.name}</span>;
                            })}
                            {(entry.concerns||[]).length > 3 && <span style={{ fontFamily:FS, fontSize:10, color:DM }}>+{entry.concerns.length-3} more</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0 }}>
                          <button className="lbtn" onClick={() => { setAnalysis(entry); setAngles({ front:{ preview:entry.thumb, b64:entry.thumb.split(",")[1] }, left:null, right:null }); setFromHistory(true); setActiveTab("summary"); }}
                            style={{ padding:"5px 10px", borderRadius:6, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>View</button>
                          <button className="lbtn" onClick={() => toggle(entry.id)}
                            style={{ padding:"5px 10px", borderRadius:6, background:isSel?"rgba(44,74,114,.15)":"transparent", border:`1px solid ${isSel?G:BR}`, fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:isSel?G:MU, textTransform:"uppercase", cursor:"pointer" }}>
                            {isSel ? "✓ Sel" : "Select"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button className="lbtn" onClick={reset}
            style={{ marginTop:22, width:"100%", padding:"13px", borderRadius:10, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:12, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>
            + New Analysis
          </button>
        </div>
      );
    };

    // ─ Tab bar ────────────────────────────────────────────────────
    const tabBar = () => (
      <div style={{ position:"sticky", bottom:0, display:"flex", background:BG, borderTop:`1px solid ${BR}`, zIndex:20, marginLeft:-22, marginRight:-22 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const badge    = tab.key === "progress" && history.length > 0 && !isActive ? history.length : 0;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex:1, padding:"10px 4px 14px", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                background:"none", border:"none", cursor:"pointer", position:"relative",
                borderTop: isActive ? `2px solid ${G}` : "2px solid transparent", transition:"border-color .15s" }}>
              <span style={{ fontSize:18, color: isActive ? G : DM, lineHeight:1, transition:"color .15s" }}>{tab.icon}</span>
              <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: isActive ? G : MU, textTransform:"uppercase", transition:"color .15s" }}>{tab.label}</span>
              {badge > 0 && (
                <div style={{ position:"absolute", top:7, left:"calc(50% + 6px)", minWidth:14, height:14, borderRadius:7, background:G, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                  <span style={{ fontFamily:FS, fontSize:8, fontWeight:700, color:"#0B0A0D" }}>{badge > 9 ? "9+" : badge}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    );

    return (
      <div className="up0" style={{ paddingBottom:8 }}>
        {activeTab === "summary"    && summaryTab()}
        {activeTab === "concerns"   && concernsTab()}
        {activeTab === "treatments" && treatmentsTab()}
        {activeTab === "progress"   && progressTab()}
        {tabBar()}
      </div>
    );
  };

  /* ── COMPARE ─────────────────────────────────────────────────────── */
  const renderCompare = () => {
    const items = history.filter(e => compareIds.includes(e.id)).sort((a,b) => new Date(a.date)-new Date(b.date));
    if (items.length < 2) return null;
    const [older, newer] = items;

    // ── concern diff ────────────────────────────────────────────────
    const oldMap = new Map((older.concerns||[]).map(c => [c.name.toLowerCase(), c]));
    const newMap = new Map((newer.concerns||[]).map(c => [c.name.toLowerCase(), c]));
    const diff = [];
    (older.concerns||[]).forEach(c => { if (!newMap.has(c.name.toLowerCase())) diff.push({ type:"resolved", name:c.name, from:c.severity, to:null }); });
    (newer.concerns||[]).forEach(c => {
      const old = oldMap.get(c.name.toLowerCase());
      if (old) { const d = SEV_ORDER[c.severity]-SEV_ORDER[old.severity]; diff.push({ type:d>0?"worsened":d<0?"improved":"unchanged", name:c.name, from:old.severity, to:c.severity }); }
      else diff.push({ type:"new", name:c.name, from:null, to:c.severity });
    });

    const DIFF_C = {
      resolved:  { bg:"rgba(21,128,61,.08)",  br:"rgba(21,128,61,.25)",  tx:"#14532D", label:"Resolved",  icon:"✓" },
      improved:  { bg:"rgba(29,78,216,.08)",   br:"rgba(29,78,216,.22)",  tx:"#1D4ED8", label:"Improved",  icon:"↑" },
      unchanged: { bg:"rgba(255,255,255,.04)", br:BR,                     tx:MU,        label:"Unchanged", icon:"→" },
      worsened:  { bg:"rgba(251,146,60,.1)",   br:"rgba(251,146,60,.3)",  tx:"#7C2D12", label:"Worsened",  icon:"↓" },
      new:       { bg:"rgba(185,28,28,.08)",   br:"rgba(185,28,28,.22)", tx:"#B91C1C", label:"New",       icon:"+" },
    };

    const TREND_C = {
      improving: { color:"#14532D", icon:"↑", label:"Improving" },
      worsening: { color:"#B91C1C", icon:"↓", label:"Worsening" },
      stable:    { color:MU,        icon:"→", label:"Stable"    },
      mixed:     { color:"#FCD34D", icon:"~", label:"Mixed"     },
    };

    const CHANGE_C = {
      improved: { bg:"rgba(21,128,61,.07)",   br:"rgba(21,128,61,.22)",   tx:"#14532D", icon:"↑" },
      worsened: { bg:"rgba(185,28,28,.07)",   br:"rgba(185,28,28,.22)",   tx:"#B91C1C", icon:"↓" },
      stable:   { bg:"rgba(255,255,255,.04)", br:BR,                      tx:MU,        icon:"→" },
    };

    const trend = compareAI && !compareAI.loading && !compareAI.error
      ? TREND_C[compareAI.overallTrend] || TREND_C.stable
      : null;

    return (
      <div className="up0" style={{ padding:"28px 0 72px" }}>

        {/* Header */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontFamily:FF, fontSize:30, fontWeight:300, color:TX, letterSpacing:"0.04em", marginBottom:4 }}>Photo Comparison</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU }}>{fmtDate(older.date)} → {fmtDate(newer.date)}</div>
        </div>

        {/* Before / After slider */}
        {older.thumb && newer.thumb && (
          <div style={{ marginBottom:20 }}>
            <BeforeAfterSlider
              beforeSrc={older.thumb} afterSrc={newer.thumb}
              beforeLabel={fmtDate(older.date)} afterLabel={fmtDate(newer.date)}
            />
            <div style={{ fontFamily:FS, fontSize:11, color:DM, textAlign:"center", marginTop:8 }}>
              Drag the handle to compare
            </div>
          </div>
        )}

        {/* Visual change analysis */}
        <div style={{ marginBottom:24 }}>
          {secLabel("Visual Changes")}

          {!compareAI && (
            <button className="lbtn" onClick={() => analyzeComparison(older, newer)}
              style={{ width:"100%", padding:"14px", borderRadius:12, border:`1px solid ${BR}`,
                       background:"transparent", fontFamily:FS, fontSize:12, letterSpacing:"0.12em",
                       color:G, textTransform:"uppercase", cursor:"pointer" }}>
              Analyse Visual Changes →
            </button>
          )}

          {compareAI?.loading && (
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px", ...card() }}>
              <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${G}`, borderTopColor:"transparent", animation:"spin .7s linear infinite", flexShrink:0 }} />
              <span style={{ fontFamily:FS, fontSize:13, color:MU }}>Comparing photos for visible changes…</span>
            </div>
          )}

          {compareAI?.error && (
            <div style={{ padding:"12px 14px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:10, fontFamily:FS, fontSize:12, color:"#F87171" }}>
              {compareAI.error}
            </div>
          )}

          {compareAI && !compareAI.loading && !compareAI.error && (
            <>
              {/* Overall trend banner */}
              {trend && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:`rgba(${trend.color === "#4ADE80" ? "74,222,128" : trend.color === "#F87171" ? "248,113,113" : trend.color === "#FCD34D" ? "252,211,77" : "255,255,255"},.08)`, border:`1px solid ${trend.color}33`, borderRadius:12, marginBottom:14 }}>
                  <span style={{ fontSize:26, color:trend.color, lineHeight:1, fontWeight:300 }}>{trend.icon}</span>
                  <div>
                    <div style={{ fontFamily:FF, fontSize:20, color:trend.color, marginBottom:2 }}>{trend.label}</div>
                    <div style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.5 }}>{compareAI.overallSummary}</div>
                  </div>
                </div>
              )}

              {/* Per-area change cards */}
              {compareAI.changes?.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {compareAI.changes.map((ch, i) => {
                    const cc = CHANGE_C[ch.direction] || CHANGE_C.stable;
                    return (
                      <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"12px 14px", background:cc.bg, border:`1px solid ${cc.br}`, borderRadius:10 }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:`rgba(0,0,0,.2)`, border:`1.5px solid ${cc.tx}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                          <span style={{ fontSize:13, color:cc.tx, fontWeight:700, lineHeight:1 }}>{cc.icon}</span>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                            <span style={{ fontFamily:FF, fontSize:16, color:TX }}>{ch.aspect}</span>
                            <span style={{ fontFamily:FS, fontSize:10, padding:"1px 7px", background:"rgba(0,0,0,.2)", borderRadius:4, color:cc.tx, letterSpacing:"0.05em" }}>{ch.area}</span>
                          </div>
                          <div style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.6 }}>{ch.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {compareAI.changes?.length === 0 && (
                <div style={{ fontFamily:FS, fontSize:13, color:DM, padding:"12px 0", textAlign:"center" }}>
                  Photos too similar or too small for detailed visual comparison
                </div>
              )}
            </>
          )}
        </div>

        {/* Concern diff */}
        <div style={{ marginBottom:28 }}>
          {secLabel("Concern Changes")}
          {diff.length === 0
            ? <div style={{ fontFamily:FS, fontSize:13, color:DM, padding:"12px 0" }}>No comparable concerns found between these analyses.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {diff.map((d, i) => {
                  const dc = DIFF_C[d.type];
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", background:dc.bg, border:`1px solid ${dc.br}`, borderRadius:9 }}>
                      <span style={{ fontSize:14, color:dc.tx, fontWeight:700, flexShrink:0, width:16, textAlign:"center" }}>{dc.icon}</span>
                      <span style={{ fontFamily:FF, fontSize:16, color:TX, flex:1 }}>{d.name}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                        <span style={{ fontFamily:FS, fontSize:10, padding:"2px 7px", background:"rgba(0,0,0,.2)", borderRadius:4, color:dc.tx, letterSpacing:"0.06em" }}>{dc.label}</span>
                        {d.from && d.to && d.type !== "unchanged" && <span style={{ fontFamily:FS, fontSize:11, color:MU }}>{d.from} → {d.to}</span>}
                        {d.type === "resolved" && <span style={{ fontFamily:FS, fontSize:11, color:MU }}>was {d.from}</span>}
                        {d.type === "new"      && <span style={{ fontFamily:FS, fontSize:11, color:MU }}>{d.to}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        <button className="lbtn" onClick={() => { setPhase("results"); setActiveTab("progress"); }}
          style={{ width:"100%", padding:"14px", borderRadius:10, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:12, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>
          ← Progress
        </button>
      </div>
    );
  };

  /* ── LAYOUT ─────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes scan{0%,100%{top:0%}50%{top:94%}}
        @keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .up0{animation:up .5s ease both}.up1{animation:up .5s .1s ease both}.up2{animation:up .5s .2s ease both}
        .lbtn{transition:filter .18s,transform .18s;cursor:pointer}
        .lbtn:hover{filter:brightness(1.12);transform:translateY(-1px)}
        .lbtn:active{transform:translateY(0);filter:brightness(.95)}
        .rcard,.hcard{transition:background .2s,transform .2s}
        .rcard:hover{background:rgba(44,74,114,.07)!important;transform:translateY(-2px)}
        .hcard{cursor:pointer}.hcard:hover{background:rgba(44,74,114,.07)!important;transform:translateY(-1px)}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(44,74,114,.28);border-radius:2px}
      `}</style>
      <div style={{ background:BG, minHeight:"100vh", color:TX, fontFamily:FS }}>
      {phase !== "welcome" && (
      <div style={{ borderBottom:`1px solid ${BR}`, padding:"18px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:10 }} onClick={reset}>
          <svg width="32" height="32" viewBox="0 0 60 60" style={{ flexShrink:0 }}>
            <circle cx="30" cy="30" r="22" fill="none" stroke={G} strokeWidth="0.75" opacity="0.38"/>
            <circle cx="30" cy="30" r="14" fill="none" stroke={G} strokeWidth="1.75"/>
            <circle cx="30" cy="30" r="7"  fill="none" stroke={G} strokeWidth="1.25"/>
            <circle cx="30" cy="30" r="2.5" fill={G}/>
            <line x1="30" y1="6"  x2="30" y2="0"  stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="54" y1="30" x2="60" y2="30" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="30" y1="54" x2="30" y2="60" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="6"  y1="30" x2="0"  y2="30" stroke={G} strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontFamily:FF, fontSize:24, fontWeight:400, letterSpacing:"0.16em", color:TX, lineHeight:1, fontStyle:"italic" }}>GlowIQ</div>
            <div style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.18em", color:DM, marginTop:3, textTransform:"uppercase" }}>Skin Roadmap</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {saved && <span style={{ fontFamily:FS, fontSize:11, color:"#4ADE80", animation:"fadeIn .3s ease" }}>✓ Saved</span>}
          {phase === "analyzing" && <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${G}`, borderTopColor:"transparent", animation:"spin .8s linear infinite" }} />}
          {phase === "results" && (
            <button className="lbtn" onClick={reset}
              style={{ padding:"6px 13px", borderRadius:8, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:11, letterSpacing:"0.09em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>
              + New
            </button>
          )}
          <button className="lbtn" onClick={() => { setProfileStep(0); const inProfile = phase === "onboarding" || phase === "profile"; setPhase(inProfile ? "upload" : "profile"); }}
            style={{ padding:"6px 13px", borderRadius:8, background:(phase==="onboarding"||phase==="profile")?"rgba(44,74,114,.15)":"transparent", border:`1px solid ${(phase==="onboarding"||phase==="profile")?G:BR}`, fontFamily:FS, fontSize:11, letterSpacing:"0.09em", color:(phase==="onboarding"||phase==="profile")?G:MU, textTransform:"uppercase", cursor:"pointer" }}>
            {profile.completedAt ? "◎ Profile" : "◎ Setup"}
          </button>
        </div>
      </div>
      )}
      <div style={{ maxWidth:680, margin:"0 auto", padding:"0 22px" }}>
        {phase === "welcome"       && renderWelcome()}
        {phase === "treatmentLog"   && renderTreatmentLog()}
        {phase === "upload"        && renderUpload()}
        {phase === "onboarding" && renderOnboarding(false)}
        {phase === "profile"    && renderOnboarding(true)}
        {phase === "analyzing" && renderAnalyzing()}
        {phase === "results"   && renderResults(analysis, angles?.front?.preview)}
        {phase === "compare"   && renderCompare()}
      </div>
    </div>
    </>
  );
}
  const getProviderLocation = () => {
    if (!navigator.geolocation) {
      setProviderMapUrl("https://maps.google.com/maps?q=medspa+aesthetics+near+me&output=embed");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setProviderMapUrl(`https://maps.google.com/maps?q=medspa+aesthetic+clinic&output=embed&center=${lat},${lng}&zoom=13`);
        setGeoLoading(false);
      },
      () => {
        setProviderMapUrl("https://maps.google.com/maps?q=medspa+aesthetics+near+me&output=embed");
        setGeoLoading(false);
      },
      { timeout:8000 }
    );
  };


