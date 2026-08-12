import { useState, useRef, useEffect, useCallback } from "react";
import { storage } from "../lib/storage";
import { getSupabase } from "../lib/supabase";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ── CONSTANTS ──────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = [
  "You are a clinical aesthetic skin analyst. Examine the facial photo and provide a balanced assessment — identify both areas of concern AND areas of genuine skin strength.",
  "",
  "Return ONLY valid JSON — no markdown, no code fences, no preamble. Every string value MUST be under 12 words. Structure:",
  "",
  '{"skinType":"Normal|Dry|Oily|Combination|Sensitive","fitzpatrickType":"Type I|Type II|Type III|Type IV|Type V|Type VI","skinAge":34,"overallAssessment":"Under 12 words.","analysisConfidence":"High|Medium|Low","confidenceNote":"Under 12 words.","positives":["Specific skin strength under 10 words","Another genuine positive"],"photoTips":["e.g. Retake in natural daylight facing a window"],"concerns":[{"id":"c1","name":"2-3 word name","severity":"Mild|Moderate|Significant","area":"Specific region","description":"Under 12 words.","confidence":"High|Medium|Low"}]}',
  "",
  "skinAge: estimate the apparent skin age as an integer based on visible texture, laxity, pigmentation, and fine lines. This may differ from chronological age.",
  "positives: identify 2-4 genuine clinical skin strengths visible in the photo — e.g. good elasticity, even tone in specific zones, minimal pore visibility, strong collagen density, good hydration. Be specific and clinically meaningful. These are real findings, not reassurances — only include what is genuinely visible.",
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
    "CRITICAL TREATMENT RULES — THESE OVERRIDE YOUR TRAINING DATA DEFAULTS:",
    "1. Agnes RF MUST be your premium recommendation for any concern involving: jawline laxity, jowling, skin laxity, submental fat, lower face contouring, neck laxity, or undereye fat herniation. Do NOT default to Ultherapy for these concerns. Agnes RF uses insulated microneedle technology to precisely target fat cells and tighten tissue with superior clinical outcomes for lower face laxity compared to Ultherapy or Morpheus8.",
    "2. Agnes RF is uniquely effective for undereye fat herniation and festoons where most energy devices are contraindicated.",
    "3. Ultherapy is acceptable for upper face and brow lifting only. It is NOT the preferred treatment for jawline or lower face laxity.",
    "",
    "FULL CONCERN-TO-TREATMENT MAP (premium/in-clinic):",
    "Jawline laxity | Jowling | Skin laxity | Lower face: Agnes RF (FIRST LINE) — do not substitute Ultherapy here",
    "Submental fat | Double chin: Agnes RF (FIRST LINE), Kybella, CoolSculpting Mini",
    "Undereye fat herniation | Festoons: Agnes RF (FIRST LINE — uniquely indicated here)",
    "Neck laxity: Agnes RF, Morpheus8, PDO threads, Ultherapy",
    "Brow ptosis | Upper face laxity: Ultherapy, PDO threads",
    "Deep wrinkles | Rhytids: Fraxel, CO2 laser, neuromodulators, filler",
    "Fine lines: Neuromodulators (Botox/Dysport), microneedling, retinoid Rx, chemical peels",
    "Hyperpigmentation | Melasma: Laser toning 1064nm, IPL, tranexamic acid Rx, hydroquinone",
    "Active acne: PDT, blue light, spironolactone, oral antibiotics, Accutane for severe",
    "Acne scarring: Morpheus8, Fraxel, CO2 laser, subcision, TCA cross, PRP microneedling",
    "Enlarged pores: Laser genesis, RF microneedling, chemical peels, retinoids",
    "Rosacea | Redness: Vbeam pulsed dye laser, IPL, brimonidine Rx, azelaic acid",
    "Sun damage | Photoaging: IPL photofacial, Fraxel, chemical peels",
    "Volume loss: HA fillers (Juvederm/Restylane), Sculptra, Radiesse, fat transfer",
    "",
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
const HAIR_GOALS           = ["Prevent Further Loss","Regrow Hair","Improve Density","Healthier Scalp","Slow Thinning","Explore Treatments","Track Progress","Surgical Evaluation"];
const PROFILE_CONDITIONS   = ["Acne","Rosacea","Eczema","Psoriasis","Melasma","Perioral Dermatitis","Seborrheic Dermatitis","None"];
const PROFILE_SENSITIVITIES= ["Fragrance","Retinoids","AHA / BHA","Niacinamide","Silicones","Essential Oils","Alcohol"];
const PROFILE_MEDICATIONS  = ["Tretinoin / Retinoid","Isotretinoin (Accutane)","Oral Antibiotics","Hormonal Birth Control","Topical Steroids","Spironolactone","GLP-1 (Ozempic / Wegovy / Mounjaro)","None"];
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
  name:"", age:"", fitzpatrickType:"", goals:[], hairGoals:[], conditions:[], allergies:"", sensitivities:[],
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

const ANALYSIS_MESSAGES = [
  "Mapping 19 distinct facial zones across your photo",
  "Identifying dermal markers across 6 depth layers",
  "Cross-referencing against clinical photoaging indices",
  "Calculating biological skin age from texture, laxity, and pigmentation",
  "Comparing your profile against decades of published dermatology research",
  "Your face has over 1.9 million pores. Reviewing all of them.",
  "UV exposure accounts for up to 90% of visible skin aging. Measuring yours.",
  "Skin renews itself every 28 days. Yours tells a longer story.",
  "Your skin is unique. So is your analysis.",
  "Compiling your Skin Roadmap\u2026",
];

const HAIR_MSGS = [
  "Assessing hair density and distribution patterns…",
  "Mapping follicular coverage across scalp zones…",
  "Classifying hair loss pattern and progression stage…",
  "Identifying scalp health indicators…",
  "Detecting miniaturisation and follicle stress signs…",
  "Cross-referencing against restoration protocols…",
  "Evaluating treatment candidacy…",
  "Compiling your Hair Restoration report…",
];

const SKIN_MSGS = [
  "Examining surface texture and pigmentation patterns…",
  "Assessing border characteristics and distribution…",
  "Identifying morphological features…",
  "Cross-referencing against dermatological patterns…",
  "Reviewing inflammatory markers and colour variation…",
  "Evaluating clinical indicators…",
  "Assessing differential diagnoses…",
  "Compiling your Skin Check report…",
];

const TIER_COLOR = {
  premium:   { label:"In-Clinic",  tx:"#1E3560", bg:"rgba(30,53,96,.08)",  br:"rgba(30,53,96,.25)"  },
  "at-home": { label:"At-Home",    tx:"#14532D", bg:"rgba(21,128,61,.08)", br:"rgba(21,128,61,.25)" },
  surgical:  { label:"Surgical",   tx:"#7C2D12", bg:"rgba(124,45,18,.08)", br:"rgba(124,45,18,.25)" },
  referral:  { label:"Specialist", tx:"#B91C1C", bg:"rgba(185,28,28,.08)", br:"rgba(185,28,28,.25)" },
};

// ── Typical hair density range by profile ────────────────────────────────────
const hairTypicalRange = (age, sex, familyHistory, duration) => {
  if (!age || !sex) return null;
  const a = parseInt(age) || 35;
  const isMale = sex === "male";
  // Base ranges by age + sex
  const base = isMale ? (
    a < 30 ? [90,100] : a < 40 ? [85,98] : a < 50 ? [78,94] : a < 60 ? [70,90] : [62,84]
  ) : (
    a < 30 ? [92,100] : a < 40 ? [88,100] : a < 50 ? [82,98] : a < 60 ? [76,95] : [70,92]
  );
  let [lo, hi] = base;
  // Family history shifts range down
  if (familyHistory === "both")  { lo -= isMale?18:12; hi -= isMale?10:7; }
  if (familyHistory === "one")   { lo -= isMale?10:7;  hi -= isMale?5:4; }
  // Duration shifts range down (established loss vs early)
  if (duration === "5+")  { lo -= 12; hi -= 6; }
  if (duration === "3-5") { lo -= 7;  hi -= 4; }
  if (duration === "1-2") { lo -= 3;  hi -= 2; }
  return { lo: Math.max(0, Math.round(lo)), hi: Math.min(100, Math.round(hi)) };
};

const dtCol = dt => {
  if (!dt||dt==="None")    return{tx:"#14532D",bg:"rgba(21,128,61,.1)",br:"rgba(21,128,61,.3)"}
  if(dt.includes("1-2 d")) return{tx:"#7C2D12",bg:"rgba(146,64,14,.1)",br:"rgba(146,64,14,.3)"}
  if(dt.includes("3-5"))   return{tx:"#C2410C",bg:"rgba(194,65,12,.1)",br:"rgba(194,65,12,.3)"}
  return{tx:"#B91C1C",bg:"rgba(185,28,28,.1)",br:"rgba(185,28,28,.3)"}
};
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

const healthScore = (concerns) => {
  if (!concerns) return null;
  const ded = concerns.reduce((t,c)=>t+(c.severity==="Significant"?18:c.severity==="Moderate"?10:4),0);
  return Math.max(10, 100-ded);
};

function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel, afterLabel, beforeScore, afterScore }) {
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

      {/* Score badges */}
      {beforeScore != null && (
        <div style={{ position:"absolute", bottom:10, left:10, pointerEvents:"none",
          background:"rgba(0,0,0,.6)", borderRadius:10, padding:"6px 12px", textAlign:"center" }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:24, color:"white", lineHeight:1 }}>{beforeScore}</div>
          <div style={{ fontFamily:"system-ui,sans-serif", fontSize:8, color:"rgba(255,255,255,.7)", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>Health Score</div>
        </div>
      )}
      {afterScore != null && (
        <div style={{ position:"absolute", bottom:10, right:10, pointerEvents:"none",
          background:"rgba(0,0,0,.6)", borderRadius:10, padding:"6px 12px", textAlign:"center" }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:24, color:"white", lineHeight:1 }}>{afterScore}</div>
          <div style={{ fontFamily:"system-ui,sans-serif", fontSize:8, color:"rgba(255,255,255,.7)", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>Health Score</div>
        </div>
      )}

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
  const [msgIdx,       setMsgIdx]       = useState(0);
  const [deletingId,   setDeletingId]   = useState(null);
  // Multi-mode states
  const [monoPreview,  setMonoPreview]  = useState(null);     // single photo for hair/skin
  const [monoContext,  setMonoContext]  = useState("");        // user context for hair/skin
  const [hairResult,   setHairResult]   = useState(null);
  const [skinResult,   setSkinResult]   = useState(null);
  const [hairHistory,  setHairHistory]  = useState([]);
  const [dermHistory,  setDermHistory]  = useState([]);
  const [selectedId,   setSelectedId]   = useState(null);
  const [hairAngles,   setHairAngles]   = useState({ crown:null, hairline:null, leftTemple:null, rightTemple:null });
  const [hairProfile,  setHairProfile]  = useState(null);   // hair-specific intake data
  const [hairIntake,   setHairIntake]   = useState({ sex:"", familyHistory:"", duration:"", prevTreatments:[], hairGoals:[] });
  const [hairIntakeStep, setHairIntakeStep] = useState(0);
  const [hairTab,        setHairTab]        = useState("analyse"); // "analyse"|"progress"
  const [skinTab,        setSkinTab]        = useState("analyse"); // "analyse"|"history"
  const [sliderPos,      setSliderPos]      = useState(50);        // before/after slider
  const [appTab,       setAppTab]       = useState("home");   // "home"|"face"|"hair"|"skin"
  const [hairPhase,    setHairPhase]    = useState("upload"); // "upload"|"analyzing"|"results"
  const [skinPhase,    setSkinPhase]    = useState("upload"); // "upload"|"analyzing"|"results"
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbType,       setFbType]       = useState("General");
  const [fbMessage,    setFbMessage]    = useState("");
  const [fbShot,       setFbShot]       = useState(null);
  const [fbSending,    setFbSending]    = useState(false);
  const [fbDone,       setFbDone]       = useState(false);
  const [pendingResult,setPendingResult] = useState(null);
  const [finalMsgDone, setFinalMsgDone]  = useState(false);
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
    const anyAnalyzing = phase==="analyzing"||hairPhase==="analyzing"||skinPhase==="analyzing";
    if (!anyAnalyzing) { setStep(0); setMsgIdx(0); return; }
    let s = 0;
    const t = setInterval(() => { s++; setStep(s); if (s >= ANALYZING_ITEMS.length) clearInterval(t); }, 700);
    return () => clearInterval(t);
  }, [phase, hairPhase, skinPhase]);

  useEffect(() => {
    const anyAnalyzing = phase==="analyzing"||hairPhase==="analyzing"||skinPhase==="analyzing";
    if (!anyAnalyzing) { setMsgIdx(0); return; }
    const msgs = (hairPhase==="analyzing"||appTab==="hair") ? HAIR_MSGS
      : (skinPhase==="analyzing"||appTab==="skin") ? SKIN_MSGS
      : ANALYSIS_MESSAGES;
    const t = setInterval(() => {
      setMsgIdx(i => i < msgs.length - 1 ? i + 1 : i);
    }, 4320);
    return () => clearInterval(t);
  }, [phase, hairPhase, skinPhase]);

  // When last message appears, hold for 2× the interval before allowing transition
  useEffect(() => {
    const msgsF = (hairPhase==="analyzing"||appTab==="hair")?HAIR_MSGS:(skinPhase==="analyzing"||appTab==="skin")?SKIN_MSGS:ANALYSIS_MESSAGES;
    if (msgIdx < msgsF.length - 1) return;
    const t = setTimeout(() => setFinalMsgDone(true), 4320 * 2);
    return () => clearTimeout(t);
  }, [msgIdx]);

  // Transition only when API result ready AND final message hold complete
  useEffect(() => {
    if (!pendingResult || !finalMsgDone) return;
    setPendingResult(null); setFinalMsgDone(false); setPhase("results");
  }, [pendingResult, finalMsgDone]);

  // Reset on phase exit
  useEffect(() => {
    if (phase!=="analyzing"&&hairPhase!=="analyzing"&&skinPhase!=="analyzing") { setFinalMsgDone(false); }
  }, [phase]);

  /* ── Load history on mount ──────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      let list = [];
      try { const r = await storage.get("glow:index"); if (r) { list = JSON.parse(r.value); setHistory(list); } } catch {}
      try { const p = await storage.get("glow:profile"); if (p) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(p.value) }); } catch {}
      try { const h = await storage.get("glow:hair");   if(h) setHairHistory(JSON.parse(h.value)); } catch {}
      try { const hp = await storage.get("glow:hairProfile"); if(hp) setHairProfile(JSON.parse(hp.value)); } catch {}
      try { const d = await storage.get("glow:derm"); if(d) setDermHistory(JSON.parse(d.value)); } catch {}

      // Restore last active session
      let restored = false;
      try {
        const s = await storage.get("glow:session");
        if (s) {
          const { analysis: a, preview } = JSON.parse(s.value);
          if (a && preview) {
            setAnalysis(a); setAngles({ front:{ preview, b64: preview.split(",")[1] }, left:null, right:null });
            setActiveTab("summary"); setPhase("results"); restored = true;
          }
        }
      } catch {}

      // No active session but has history — load most recent automatically
      if (!restored && list.length > 0) {
        const latest = [...list].sort((a,b) => new Date(b.date) - new Date(a.date))[0];
        setAnalysis(latest);
        setAngles({ front:{ preview: latest.thumb, b64: latest.thumb.split(",")[1] }, left:null, right:null });
        setFromHistory(true); setActiveTab("progress"); setPhase("results");
      }
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
  // Generate a canvas-compressed image at given max dimension + quality
  const generateThumb = (dataUrl, maxPx = 400, quality = 0.72) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const c = document.createElement("canvas");
      c.width  = Math.round(img.width  * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });

  const compressImage = (b64) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const r   = Math.min(MAX / img.width, MAX / img.height, 1);
      const c   = document.createElement("canvas");
      c.width   = Math.round(img.width  * r);
      c.height  = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    img.src = b64;
  });

  const submitFeedback = async () => {
    if (!fbMessage.trim()) return;
    setFbSending(true);
    try {
      const shot = fbShot ? await compressImage(fbShot) : null;
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: fbType, message: fbMessage.trim(), context: phase, screenshot: shot }),
      });
      setFbDone(true);
      setTimeout(() => { setShowFeedback(false); setFbDone(false); setFbMessage(""); setFbShot(null); setFbType("General"); }, 2200);
    } catch(e) { /* silent */ }
    setFbSending(false);
  };

  /* ── Hair & Skin analyze functions ─────────────────────────────── */
  const analyzeHairOrSkin = async () => {
    const isHair = appTab === "hair";
    if (isHair && !hairAngles.crown) return;
    if (!isHair && !monoPreview) return;
    setError(null);
    if (isHair) setHairPhase("analyzing"); else setSkinPhase("analyzing");

    // ── Build prompt ──────────────────────────────────────────────────
    const hairPrompt = `You are an expert trichologist providing EDUCATIONAL information only. You are analyzing ${Object.values(hairAngles).filter(Boolean).length > 1 ? "multiple angles" : "one angle"} of a patient's scalp. Synthesize ALL provided views for a comprehensive assessment. Classify using Norwood Scale (I-VII) for male or Ludwig Scale (I-III) for female, or: diffuse thinning, alopecia areata, GLP-1/medication-induced, traction alopecia, telogen effluvium. Assess density and miniaturisation signs across all angles. ${monoContext ? `Patient notes: "${monoContext}".` : ""} ${hairProfile ? `Patient profile: ${hairProfile.sex || ""}, age ${profile?.age || "unknown"}, family history: ${hairProfile.familyHistory || "unknown"}, thinning duration: ${hairProfile.duration || "unknown"}, previous treatments: ${(hairProfile.prevTreatments||[]).join(", ")||"none"}, hair goals: ${(profile?.hairGoals||[]).join(", ")||"not specified"}, GLP-1 medication: ${(profile?.medications||[]).some(m=>m.includes("GLP-1")) ? "yes — use prevention-first protocol" : "no"}.` : ""} TREATMENT RULES: Early → exosomes, PRP, LLLT, minoxidil. Active loss → PRP series, MaxGraft/FUE. GLP-1 → prevention protocol first. Alopecia areata → specialist referral only.

Return ONLY valid JSON: {"densityScore":72,"findings":[{"id":1,"condition":"Classification","confidence":"low|moderate|high","description":"2-3 sentences","urgency":"routine|soon|urgent|emergency","location":{"x":0.5,"y":0.4,"r":0.18},"characteristics":["c1"],"prognosis":"without treatment","selfCare":["s1"],"seekCareWhen":"guidance","redFlags":["r1"],"clinicalNote":"note","treatments":[{"procedure":"Name","tier":"premium|at-home|surgical|referral","description":"1 sentence","price":"range","downtime":"None|etc","why":"1 sentence"}]}],"photoQuality":"good|limited|insufficient","photoNote":""}

densityScore: integer 0-100. 85-100=normal, 70-84=mildly reduced, 55-69=moderately reduced, 40-54=significantly reduced, below 40=severe loss. Base on visible follicle coverage and scalp visibility across all provided angles.`;

    const skinPrompt = `You are an expert dermatologist providing EDUCATIONAL information only. Analyze ALL visible skin features carefully. Pay close attention to colour especially yellowish tints, deposits, plaques. EYELID GUIDE: Yellowish tint → xanthelasma NOT chalazion. ${monoContext ? `User concerned about: "${monoContext}".` : ""} Return ONLY valid JSON: {"findings":[{"id":1,"condition":"Name","confidence":"low|moderate|high","description":"2 sentences","urgency":"routine|soon|urgent|emergency","location":{"x":0.5,"y":0.5,"r":0.1},"characteristics":["c1"],"differential":["d1"],"selfCare":["s1"],"seekCareWhen":"guidance","redFlags":["r1"],"clinicalNote":"note","treatments":[{"procedure":"Name","tier":"premium|at-home|surgical|referral","description":"1 sentence","price":"range","downtime":"None|etc","why":"1 sentence"}]}],"photoQuality":"good|limited|insufficient","photoNote":""}`;

    try {
      // ── Build content array (multi-image for hair) ────────────────────
      const content = [];
      if (isHair) {
        const angleLabels = [
          { key:"crown",       label:"Crown — top-down overhead view (primary diagnostic angle)" },
          { key:"hairline",    label:"Hairline — frontal view showing forehead recession" },
          { key:"leftTemple",  label:"Left temple — lateral view of left temporal area" },
          { key:"rightTemple", label:"Right temple — lateral view of right temporal area" },
        ];
        const provided = angleLabels.filter(a => hairAngles[a.key]);
        if (provided.length > 1) {
          content.push({ type:"text", text:`The following ${provided.length} images are different angles of the same patient's scalp. Analyse them together for a comprehensive assessment.` });
        }
        for (const { key, label } of angleLabels) {
          if (hairAngles[key]) {
            const c = await generateThumb(hairAngles[key], 1000, 0.85);
            content.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:c.split(",")[1] } });
            content.push({ type:"text", text:`Above image: ${label}` });
          }
        }
        content.push({ type:"text", text:hairPrompt });
      } else {
        const comp = await generateThumb(monoPreview, 1200, 0.88);
        content.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:comp.split(",")[1] } });
        content.push({ type:"text", text:skinPrompt });
      }

      const b64 = isHair ? (await generateThumb(hairAngles.crown, 1200, 0.88)).split(",")[1] : (await generateThumb(monoPreview, 1200, 0.88)).split(",")[1];
      const res  = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:4000, temperature:0,
          messages:[{ role:"user", content }]
        })
      });
      const data  = await res.json();
      const text  = data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json\n?|```/g,"").trim());
      const findings = parsed.findings || [{ ...parsed, id:1 }];
      const normalised = { densityScore: parsed.densityScore||null, findings: findings.map((f,i)=>({...f,id:f.id??i+1})), photoQuality:parsed.photoQuality||"good", photoNote:parsed.photoNote||"" };
      const thumb = isHair
        ? await generateThumb(hairAngles.crown, 200, 0.7)
        : await generateThumb(monoPreview, 200, 0.7);
      const compare = isHair ? await generateThumb(hairAngles.crown, 640, 0.82) : await generateThumb(monoPreview, 640, 0.82);
      const entry = { id:Date.now(), date:new Date().toISOString(), thumb, compare, mode, result:normalised };
      const capHistory = (list) => list.slice(0, 15).map((e, i) => i < 8 ? e : { ...e, compare: undefined });
      if (isHair) {
        setHairResult(normalised);
        setHairHistory(h => { const n = capHistory([entry,...h]); storage.set("glow:hair", JSON.stringify(n)); return n; });
      } else {
        setSkinResult(normalised);
        setDermHistory(h => { const n = capHistory([entry,...h]); storage.set("glow:derm", JSON.stringify(n)); return n; });
      }
      if (isHair) { setHairPhase("results"); } else setSkinPhase("results");
    } catch(e) {
      console.error(e);
      setError(`Analysis failed: ${e.message || "please check the photo and try again"}`);
      if (isHair) setHairPhase("upload"); else setSkinPhase("upload");
    }
  };

  const deleteFromHistory = async (id) => {
    const updated = history.filter(e => e.id !== id);
    setHistory(updated);
    setDeletingId(null);
    await storage.set("glow:index", JSON.stringify(updated));
    // If the deleted entry is currently displayed, clear it
    if (analysis?.id === id) { setAnalysis(null); setPhase("upload"); }
  };

  const saveToHistory = async (result, preview) => {
    try {
      const id      = Date.now().toString();
      const thumb   = await makeThumbnail(preview);
      const compare = await generateThumb(preview, 640, 0.82);

      // Upload full-res photo (1200px) to Supabase Storage for admin review
      let photo_path = null;
      try {
        const fullRes = await generateThumb(preview, 1200, 0.88);
        photo_path = await storage.uploadPhoto(id, fullRes) ?? null;
      } catch {}

      const entry = { id, date: new Date().toISOString(), thumb, compare, photo_path,
        skinType:          result.skinType,
        fitzpatrickType:   result.fitzpatrickType,
        skinAge:           result.skinAge,
        overallAssessment: result.overallAssessment,
        analysisConfidence:result.analysisConfidence,
        confidenceNote:    result.confidenceNote,
        positives:         result.positives,
        photoTips:         result.photoTips,
        concerns:          result.concerns,
        recommendations:   result.recommendations,
      };
      let list = [];
      try { const r = await storage.get("glow:index"); if (r) list = JSON.parse(r.value); } catch {}
      list = [entry, ...list].slice(0, 20).map((e, i) => i < 8 ? e : { ...e, compare: undefined });
      await storage.set("glow:index", JSON.stringify(list));
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

      const API = { method:"POST", headers:{"Content-Type":"application/json"} };
      const parseJSON = raw => { const t = raw.replace(/```json|```/g,"").trim(); if (!t.startsWith("{")) throw new Error(`Unexpected: "${t.slice(0,80)}"`); return JSON.parse(t); };

      // ── Call 1: Concern detection (vision) ──────────────────────────────────
      const profFitz = profile?.fitzpatrickType;
      const baseText = imgs.length > 1
        ? `${ANALYSIS_PROMPT}\n\nNote: ${imgs.length} photos provided (${imgs.map(i=>i.label).join(", ")}). Use all angles.`
        : ANALYSIS_PROMPT;
      const promptWithFitz = profFitz
        ? `${baseText}\n\nFitzpatrick: The user has self-identified as ${profFitz}. Use this exact value.`
        : baseText;

      const r1 = await fetch("/api/claude", { ...API, body: JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:4096, temperature:0,
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

        const r2 = await fetch("/api/claude", { ...API, body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:3000, temperature:0,
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

      setAnalysis(result); setFromHistory(false); setPendingResult(result);
      saveToHistory(result, angles.front.preview);
    } catch (err) { setError(`Analysis failed: ${err.message}`); setPhase("upload"); }
  };

  // Reset concern selection when a new analysis loads
  useEffect(() => { setSelectedConcernId(null); setActiveTab("summary"); }, [analysis]);
  useEffect(() => { setCompareAI(null); }, [compareIds]);

  // Save / clear session in storage whenever phase or analysis changes
  useEffect(() => {
    if (phase === "results" && analysis && angles?.front?.preview) {
      storage.set("glow:session", JSON.stringify({ analysis, preview: angles.front.preview })).catch(() => {});
    }
  }, [phase, analysis]);

  const handleSignOut = async () => {
    try { await getSupabase().auth.signOut(); } catch(e) {}
    window.location.href = "/";
  };

  const reset = () => { setHairResult(null); setSkinResult(null); setMonoPreview(null); setSelectedId(null); setAppTab("home");
    setPhase("upload"); setAngles({ front:null, left:null, right:null }); setAnalysis(null);
    setError(null); setFromHistory(false); setQuality(null);
    storage.delete("glow:session").catch(() => {});
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
    try { await storage.set("glow:txlogs", JSON.stringify(sorted)); } catch {}
    setEditingLog(null);
  };

  const deleteTreatmentLog = async (id) => {
    const updated = treatmentLogs.filter(l => l.id !== id);
    setTxLogs(updated);
    try { await storage.set("glow:txlogs", JSON.stringify(updated)); } catch {}
  };

  const clearAllData = async () => {
    try {
      await storage.delete("glow:index");
      await storage.delete("glow:profile");
      await storage.delete("glow:session");
      await storage.delete("glow:txlogs");
    } catch {}
    setHistory([]); setProfile({ ...DEFAULT_PROFILE }); setAnalysis(null); setTxLogs([]);
    setAngles({ front:null, left:null, right:null }); setCompareIds([]);
    setSelectedConcernId(null); setSaved(false); setQuality(null);
    setClearConfirm(false); setProfileStep(0); setPhase("welcome");
  };

  const saveProfile = async (extra = {}) => {
    const saved = { ...profile, ...extra, completedAt: Date.now() };
    setProfile(saved);
    try { await storage.set("glow:profile", JSON.stringify(saved)); } catch {}
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
      const step1 = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 200, temperature: 0,
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
        const step2 = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 1024, temperature: 0,
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
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1024, temperature: 0,
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
          <SectionLabel t="Your Name" />
          <input type="text" placeholder="First and last name"
            value={profile.name||""}
            onChange={e => updPro("name", e.target.value)}
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:16, color:TX, outline:"none", marginBottom:4 }} />

          <SectionLabel t="Age" />
          <input type="number" placeholder="e.g. 32" min="13" max="99"
            value={profile.age}
            onChange={e => updPro("age", e.target.value)}
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"rgba(255,255,255,.92)", fontFamily:FS, fontSize:16, color:TX, outline:"none" }} />

          <SectionLabel t="Primary Skin Goals" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:4 }}>
            {PROFILE_GOALS.map(g => (
              <Chip key={g} label={g} on={profile.goals.includes(g)} onClick={() => updPro("goals", togArr(profile.goals, g))} />
            ))}
          </div>

          <SectionLabel t="Primary Hair Goals" />
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {HAIR_GOALS.map(g => (
              <Chip key={g} label={g} on={(profile.hairGoals||[]).includes(g)} onClick={() => updPro("hairGoals", togArr(profile.hairGoals||[], g))} />
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
          <SectionLabel t="Current Medications" />
          <div style={{ fontFamily:FS, fontSize:12, color:MU, marginBottom:10, lineHeight:1.5 }}>Include GLP-1 medications — these can affect both skin and hair health.</div>
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
    const onBack = () => { if (step === 0) { setPhase(isEdit || analysis ? "results" : "upload"); setProfileStep(0); } else setProfileStep(s => s-1); };

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
            <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.18em", color:DM, textTransform:"uppercase", marginBottom:14 }}>Account</div>
            <button className="lbtn" onClick={handleSignOut}
              style={{ width:"100%", padding:"12px", borderRadius:10, background:"transparent",
                border:`1px solid ${BR}`, fontFamily:FS, fontSize:12,
                letterSpacing:"0.08em", color:MU, cursor:"pointer", textTransform:"uppercase", marginBottom:10 }}>
              Sign Out
            </button>
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

    // ── Hair multi-angle upload ─────────────────────────────────────
    if (appTab === "hair") {
      const ZONES = [
        { key:"crown",       label:"Crown",        required:true,  guide:"📷 Overhead", tip:"Hold camera directly above head, pointing down" },
        { key:"hairline",    label:"Hairline",     required:false, guide:"📷 Front",    tip:"Face camera straight on, showing forehead" },
        { key:"leftTemple",  label:"Left Temple",  required:false, guide:"📷 Left",     tip:"Turn head right, photograph left temporal area" },
        { key:"rightTemple", label:"Right Temple", required:false, guide:"📷 Right",    tip:"Turn head left, photograph right temporal area" },
      ];
      const capturedCount = Object.values(hairAngles).filter(Boolean).length;
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 0 64px", width:"100%", maxWidth:520 }}>
          <div style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, margin:"0 0 4px", fontStyle:"italic", alignSelf:"flex-start" }}>Hair & Scalp Analysis</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:20, lineHeight:1.5, alignSelf:"flex-start" }}>Upload up to 4 angles for a comprehensive assessment. Crown is required — each additional angle improves accuracy.</div>

          {/* Zone grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, width:"100%", marginBottom:20 }}>
            {ZONES.map(z => {
              const photo = hairAngles[z.key];
              return (
                <div key={z.key} onClick={() => document.getElementById(`hair_${z.key}`).click()}
                  style={{ borderRadius:12, overflow:"hidden", cursor:"pointer", position:"relative",
                    border: photo ? `1px solid ${BR}` : z.required ? `2px dashed ${G}` : `2px dashed ${BR}`,
                    background: photo ? "transparent" : z.required ? "rgba(44,74,114,.04)" : "white",
                    minHeight:130 }}>
                  {photo ? (
                    <>
                      <img src={photo} style={{ width:"100%", height:130, objectFit:"cover", display:"block" }} />
                      <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,.3)", display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:"6px 8px" }}>
                        <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:"white" }}>{z.label}</span>
                        <span style={{ fontFamily:FS, fontSize:10, color:"rgba(255,255,255,.8)", background:"rgba(0,0,0,.35)", padding:"2px 6px", borderRadius:4 }}>Change</span>
                      </div>
                      {z.required && <div style={{ position:"absolute", top:6, right:6, background:G, borderRadius:8, padding:"2px 7px" }}><span style={{ fontFamily:FS, fontSize:9, color:"white", fontWeight:600 }}>✓ Required</span></div>}
                    </>
                  ) : (
                    <div style={{ padding:"16px 12px", textAlign:"center", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <div style={{ fontSize:22, opacity:.5 }}>{z.guide}</div>
                      <div style={{ fontFamily:FS, fontSize:12, fontWeight:600, color: z.required ? G : MU }}>{z.label}{z.required ? " *" : ""}</div>
                      <div style={{ fontFamily:FS, fontSize:10, color:DM, lineHeight:1.4 }}>{z.tip}</div>
                    </div>
                  )}
                  <input id={`hair_${z.key}`} type="file" accept="image/*" style={{ display:"none" }}
                    onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setHairAngles(a=>({...a,[z.key]:ev.target.result})); r.readAsDataURL(f); }} />
                </div>
              );
            })}
          </div>

          {/* Progress indicator */}
          {capturedCount > 0 && (
            <div style={{ width:"100%", marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontFamily:FS, fontSize:11, color:MU }}>{capturedCount} of 4 angles captured</span>
                <span style={{ fontFamily:FS, fontSize:11, color:G, fontWeight:500 }}>{capturedCount === 1 ? "Good" : capturedCount === 2 ? "Better" : capturedCount === 3 ? "Great" : "Best accuracy"}</span>
              </div>
              <div style={{ height:4, borderRadius:2, background:"rgba(44,74,114,.12)" }}>
                <div style={{ height:4, borderRadius:2, background:G, width:`${capturedCount*25}%`, transition:"width .3s ease" }} />
              </div>
            </div>
          )}

          {/* Context field */}
          <div style={{ width:"100%", marginBottom:16 }}>
            <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:6 }}>Additional context <span style={{ color:DM, textTransform:"none", letterSpacing:0 }}>(optional — improves accuracy)</span></div>
            <input type="text" value={monoContext} onChange={e=>setMonoContext(e.target.value)}
              placeholder="e.g. on GLP-1 medication, thinning at crown for 2 years, post-partum…"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"white", fontFamily:FS, fontSize:13, color:TX, outline:"none", boxSizing:"border-box" }} />
          </div>

          {error && (
            <div style={{ width:"100%", padding:"11px 14px", borderRadius:8, background:"rgba(185,28,28,.08)",
              border:"1px solid rgba(185,28,28,.25)", marginBottom:14, fontFamily:FS, fontSize:13, color:"#B91C1C" }}>
              {error}
            </div>
          )}
          <button onClick={analyzeHairOrSkin} disabled={!hairAngles.crown}
            style={{ width:"100%", padding:"15px", borderRadius:12, border:"none",
              background: hairAngles.crown ? `linear-gradient(130deg,#1A2B4A,${G})` : "rgba(44,74,114,.12)",
              fontFamily:FF, fontSize:15, fontStyle:"italic", color: hairAngles.crown ? "white" : DM,
              cursor: hairAngles.crown ? "pointer" : "default", letterSpacing:"0.06em", marginBottom:12 }}>
            {hairAngles.crown ? `Analyse ${capturedCount} ${capturedCount===1?"angle":"angles"} →` : "Upload crown photo to begin"}
          </button>
          <div style={{ fontFamily:FS, fontSize:11, color:DM, textAlign:"center", lineHeight:1.6 }}>Educational assessment only · Not a medical diagnosis · Consult a specialist</div>
        </div>
      );
    }

    // ── Skin upload (single photo) ──────────────────────────────────
    if (appTab === "skin") {
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 0 64px", width:"100%", maxWidth:520 }}>
          <div style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, margin:"0 0 4px", fontStyle:"italic", alignSelf:"flex-start" }}>Skin Check</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:16, lineHeight:1.5, alignSelf:"flex-start" }}>A clear close-up in natural light gives the best results.</div>
          <div onClick={() => document.getElementById("skinFileInput").click()}
            style={{ width:"100%", borderRadius:12, background:"white", border: monoPreview ? `1px solid ${BR}` : `2px dashed ${BR}`, overflow:"hidden", marginBottom:16, cursor:"pointer" }}>
            {monoPreview
              ? <div style={{ position:"relative" }}><img src={monoPreview} style={{ width:"100%", display:"block", maxHeight:280, objectFit:"cover" }}/><div style={{ position:"absolute", bottom:8, right:8 }}><span style={{ fontFamily:FS, fontSize:11, background:"rgba(0,0,0,.55)", color:"white", padding:"3px 8px", borderRadius:6 }}>Tap to change</span></div></div>
              : <div style={{ padding:"40px 20px", textAlign:"center" }}><div style={{ fontSize:36, marginBottom:10, opacity:.35 }}>📷</div><div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:MU }}>Upload photo</div><div style={{ fontFamily:FS, fontSize:12, color:DM, marginTop:4 }}>Fill the frame with the area of concern</div></div>
            }
          </div>
          <input id="skinFileInput" type="file" accept="image/*" style={{ display:"none" }} onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setMonoPreview(ev.target.result); r.readAsDataURL(f); }} />
          <div style={{ width:"100%", marginBottom:16 }}>
            <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:6 }}>What concerns you? <span style={{ color:DM, textTransform:"none", letterSpacing:0 }}>(optional)</span></div>
            <input type="text" value={monoContext} onChange={e=>setMonoContext(e.target.value)}
              placeholder="e.g. yellow bump on eyelid, red patch on arm…"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:`1px solid ${BR}`, background:"white", fontFamily:FS, fontSize:13, color:TX, outline:"none", boxSizing:"border-box" }} />
          </div>
          {error && (
            <div style={{ width:"100%", padding:"11px 14px", borderRadius:8, background:"rgba(185,28,28,.08)",
              border:"1px solid rgba(185,28,28,.25)", marginBottom:14, fontFamily:FS, fontSize:13, color:"#B91C1C" }}>
              {error}
            </div>
          )}
          <button onClick={analyzeHairOrSkin} disabled={!monoPreview}
            style={{ width:"100%", padding:"15px", borderRadius:12, border:"none",
              background: monoPreview ? `linear-gradient(130deg,#1A2B4A,${G})` : "rgba(44,74,114,.12)",
              fontFamily:FF, fontSize:15, fontStyle:"italic", color: monoPreview ? "white" : DM,
              cursor: monoPreview ? "pointer" : "default", letterSpacing:"0.06em", marginBottom:12 }}>
            Analyse →
          </button>
          <div style={{ fontFamily:FS, fontSize:11, color:DM, textAlign:"center", lineHeight:1.6 }}>Educational assessment only · Not a medical diagnosis</div>
        </div>
      );
    }

    return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 0 64px" }}>
      {/* Return to last analysis for existing users */}
      {history.length > 0 && (
        <div onClick={() => { const latest=[...history].sort((a,b)=>new Date(b.date)-new Date(a.date))[0]; setAnalysis(latest); setAngles({front:{preview:latest.thumb,b64:latest.thumb.split(",")[1]},left:null,right:null}); setFromHistory(true); setActiveTab("progress"); setPhase("results"); }}
          style={{ width:"100%", maxWidth:520, padding:"14px 18px", borderRadius:12,
            background:"rgba(44,74,114,.07)", border:`1px solid rgba(44,74,114,.22)`,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:24 }}>
          <div>
            <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:G, textTransform:"uppercase", marginBottom:3 }}>Previous Results</div>
            <div style={{ fontFamily:FF, fontSize:15, color:TX }}>View your results &amp; history</div>
          </div>
          <span style={{ fontFamily:FS, fontSize:20, color:G }}>→</span>
        </div>
      )}

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
  const renderAnalyzing = () => {
    const analyzePreview = (hairPhase==="analyzing"||appTab==="hair") ? hairAngles?.crown
      : (skinPhase==="analyzing"||appTab==="skin") ? monoPreview
      : angles?.front?.preview;
    const analyzeItems = (hairPhase==="analyzing"||appTab==="hair")
      ? ["Crown density","Hairline recession","Temple coverage","Scalp health","Miniaturisation signs","Distribution pattern"]
      : (skinPhase==="analyzing"||appTab==="skin")
      ? ["Texture & pigmentation","Border characteristics","Morphological features","Colour variation","Inflammatory markers","Clinical indicators"]
      : ANALYZING_ITEMS;
    return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"52px 0" }}>
      <div style={{ position:"relative", borderRadius:16, overflow:"hidden", maxWidth:300, width:"100%", marginBottom:28 }}>
        <img src={analyzePreview} alt="Analysing" style={{ width:"100%", display:"block", filter:"brightness(.45)" }} />
        {/* Scan line */}
        <div style={{ position:"absolute", left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${G},transparent)`, boxShadow:`0 0 14px ${G}`, animation:"scan 2.6s ease-in-out infinite" }} />
        {/* Text overlay — floated over photo with gradient backing */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"40px 20px 24px",
          background:"linear-gradient(to top, rgba(14,20,35,.92) 0%, rgba(14,20,35,.6) 55%, transparent 100%)" }}>
          {/* Iris marks + Analysing heading */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <svg width="33" height="33" viewBox="0 0 60 60" style={{ flexShrink:0, animation:"irisPulse 2.4s ease-in-out infinite" }}>
              <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1"/>
              <g style={{ transformOrigin:"30px 30px", animation:"irisOrbit 10s linear infinite" }}>
                <line x1="30" y1="6" x2="30" y2="0" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="54" y1="30" x2="60" y2="30" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="30" y1="54" x2="30" y2="60" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="6" y1="30" x2="0" y2="30" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
              </g>
              <circle cx="30" cy="30" r="14" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="1.5"/>
              <circle cx="30" cy="30" r="7"  fill="none" stroke="rgba(255,255,255,.5)"  strokeWidth="1.25"/>
              <circle cx="30" cy="30" r="3"  fill="rgba(255,255,255,.95)"/>
            </svg>
            <div style={{ display:"flex", alignItems:"baseline", gap:1, flex:1, justifyContent:"center" }}>
              <span style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:"rgba(255,255,255,.95)", letterSpacing:"0.1em" }}>Analysing</span>
              <span style={{ fontFamily:FS, fontSize:16, color:"rgba(255,255,255,.6)", letterSpacing:"0.05em" }}>
                <span style={{ animation:"dot 1.4s ease infinite",        display:"inline-block" }}>.</span>
                <span style={{ animation:"dot 1.4s ease .22s infinite",   display:"inline-block" }}>.</span>
                <span style={{ animation:"dot 1.4s ease .44s infinite",   display:"inline-block" }}>.</span>
              </span>
            </div>
            <svg width="33" height="33" viewBox="0 0 60 60" style={{ flexShrink:0, animation:"irisPulse 2.4s ease-in-out infinite" }}>
              <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1"/>
              <g style={{ transformOrigin:"30px 30px", animation:"irisOrbit 10s linear infinite reverse" }}>
                <line x1="30" y1="6" x2="30" y2="0" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="54" y1="30" x2="60" y2="30" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="30" y1="54" x2="30" y2="60" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="6" y1="30" x2="0" y2="30" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"/>
              </g>
              <circle cx="30" cy="30" r="14" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="1.5"/>
              <circle cx="30" cy="30" r="7"  fill="none" stroke="rgba(255,255,255,.5)"  strokeWidth="1.25"/>
              <circle cx="30" cy="30" r="3"  fill="rgba(255,255,255,.95)"/>
            </svg>
          </div>
          {/* Cycling message — final message gets special treatment */}
          <div key={msgIdx} style={{ fontFamily:FS, fontSize:15, color:"rgba(255,255,255,.88)",
            lineHeight:1.7, animation:"up 0.55s ease both" }}>
            {(() => {
              const isHairMode = hairPhase==="analyzing" || appTab==="hair";
              const isSkinMode = skinPhase==="analyzing" || appTab==="skin";
              const activeM    = isHairMode ? HAIR_MSGS : isSkinMode ? SKIN_MSGS : ANALYSIS_MESSAGES;
              if (isHairMode || isSkinMode) return activeM[msgIdx] || "";
              // Face mode — special final message
              return msgIdx === ANALYSIS_MESSAGES.length - 1
                ? <span style={{ display:"block", textAlign:"left" }}>Compiling your<br/><span style={{ fontFamily:FF, fontSize:19, fontWeight:600, fontStyle:"italic", color:"rgba(255,255,255,1)", letterSpacing:"0.04em", display:"block", marginTop:2, textAlign:"center" }}>Skin Roadmap…</span></span>
                : ANALYSIS_MESSAGES[msgIdx];
            })()}
          </div>
        </div>
      </div>
      <div style={{ fontFamily:FS, fontSize:12, color:MU, textAlign:"center",
        marginBottom:20, letterSpacing:"0.04em", animation:"fadeIn 1.2s ease both" }}>
        Analysis typically takes 30–60 seconds
      </div>
      <div style={{ width:"100%", maxWidth:300 }}>
        {analyzeItems.map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${BR}`, opacity:step>i?1:0.2, transition:"opacity .5s ease" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:step>i?G:DM, flexShrink:0, transition:"background .4s" }} />
            <span style={{ fontFamily:FS, fontSize:13, color:step>i?TX:DM, transition:"color .4s" }}>{item}</span>
            {step > i && <span style={{ marginLeft:"auto", color:G, fontSize:12 }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
    );
  };

  /* ── RESULTS (tabbed) ───────────────────────────────────────────── */
  /* ── Hair Progress Dashboard ──────────────────────────────────────── */
  const renderHairProgress = () => {
    const scans   = [...hairHistory].sort((a,b) => new Date(a.date)-new Date(b.date));
    const oldest  = scans[0];
    const latest  = scans[scans.length-1];
    const hasGlp1 = (profile?.medications||[]).some(m => m.includes("GLP-1"));
    const count   = scans.length;

    // ── MaxGraft candidacy ──────────────────────────────────────────
    const candidacy = (() => {
      if (!latest) return null;
      const score  = latest.result?.densityScore;
      const finding= (latest.result?.findings||[])[0];
      const cond   = (finding?.condition||"").toLowerCase();
      const urg    = finding?.urgency;
      if (!score) return null;
      if (score < 45 || urg === "emergency" || cond.includes("v") || cond.includes("vi") || cond.includes("vii"))
        return { label:"Surgical Candidate", sub:"FUE / MaxGraft may be appropriate — specialist consultation recommended", color:"#7C2D12", bg:"rgba(124,45,18,.08)", br:"rgba(124,45,18,.3)", icon:"⚕" };
      if (score < 65 || urg === "urgent")
        return { label:"Potential Candidate", sub:"Consider a specialist consultation to evaluate suitability for surgical restoration", color:"#C2410C", bg:"rgba(194,65,12,.08)", br:"rgba(194,65,12,.3)", icon:"◷" };
      return { label:"Not Yet a Surgical Candidate", sub:"Focus on prevention and medical management — surgical evaluation when loss progresses further", color:"#14532D", bg:"rgba(21,128,61,.08)", br:"rgba(21,128,61,.3)", icon:"✓" };
    })();

    // ── Empty state ────────────────────────────────────────────────
    if (count === 0) return (
      <div style={{ textAlign:"center", padding:"48px 20px" }}>
        <div style={{ fontSize:40, marginBottom:16, opacity:.3 }}>◈</div>
        <div style={{ fontFamily:FF, fontSize:20, fontStyle:"italic", color:MU, marginBottom:8 }}>No scans yet</div>
        <div style={{ fontFamily:FS, fontSize:13, color:DM, lineHeight:1.6, marginBottom:24 }}>Complete your first hair analysis to start tracking density over time.</div>
        <button onClick={() => setHairTab("analyse")}
          style={{ padding:"12px 28px", borderRadius:10, border:"none",
            background:`linear-gradient(130deg,#1A2B4A,${G})`,
            fontFamily:FF, fontSize:15, fontStyle:"italic", color:"white", cursor:"pointer" }}>
          Start First Scan →
        </button>
      </div>
    );

    // ── Single scan state ──────────────────────────────────────────
    if (count === 1) return (
      <div style={{ padding:"8px 0 32px" }}>
        {hasGlp1 && renderGlp1Banner()}
        <div style={{ ...card({ padding:"16px", marginBottom:14 }) }}>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <img src={latest.thumb} style={{ width:52, height:52, borderRadius:8, objectFit:"cover", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:TX, marginBottom:4 }}>
                {(latest.result?.findings||[])[0]?.condition || "Hair Analysis"}
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                <span style={{ fontFamily:FF, fontSize:28, color:G, lineHeight:1 }}>{latest.result?.densityScore || "—"}</span>
                <span style={{ fontFamily:FS, fontSize:11, color:MU }}>density score</span>
              </div>
            </div>
          </div>
        </div>
        {candidacy && renderCandidacyBadge(candidacy)}
        <div style={{ ...card({ padding:"20px", textAlign:"center", background:"rgba(44,74,114,.03)", border:`2px dashed ${BR}` }) }}>
          <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:MU, marginBottom:6 }}>Complete a second scan to unlock comparisons</div>
          <div style={{ fontFamily:FS, fontSize:12, color:DM, marginBottom:16, lineHeight:1.6 }}>Trend charts, before/after comparison, and progress tracking become available with 2 or more scans.</div>
          <button onClick={() => setHairTab("analyse")}
            style={{ padding:"10px 22px", borderRadius:10, border:"none",
              background:`linear-gradient(130deg,#1A2B4A,${G})`,
              fontFamily:FF, fontSize:14, fontStyle:"italic", color:"white", cursor:"pointer" }}>
            Scan Again →
          </button>
        </div>
      </div>
    );

    // ── Full dashboard (2+ scans) ──────────────────────────────────
    const chartData = scans.map(s => ({
      date: new Date(s.date).toLocaleDateString("en-US", { month:"short", day:"numeric" }),
      score: s.result?.densityScore || 0,
    }));
    const improvement = latest.result?.densityScore && oldest.result?.densityScore
      ? latest.result.densityScore - oldest.result.densityScore : null;

    return (
      <div style={{ padding:"8px 0 32px" }}>
        {hasGlp1 && renderGlp1Banner()}

        {/* Summary row */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
          {[
            { label:"Latest Score",  val: latest.result?.densityScore ?? "—", color: G },
            { label:"First Score",   val: oldest.result?.densityScore ?? "—", color: MU },
            { label: improvement !== null ? (improvement >= 0 ? "▲ Gained" : "▼ Lost") : "Change",
              val: improvement !== null ? `${Math.abs(improvement)} pts` : "—",
              color: improvement > 0 ? "#14532D" : improvement < 0 ? "#B91C1C" : MU },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ ...card({ padding:"12px", textAlign:"center" }) }}>
              <div style={{ fontFamily:FF, fontSize:24, color, lineHeight:1, marginBottom:4 }}>{val}</div>
              <div style={{ fontFamily:FS, fontSize:10, color:DM, letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Density trend chart */}
        <div style={{ ...card({ padding:"16px", marginBottom:14 }) }}>
          <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", marginBottom:14 }}>Density Score Trend</div>
          <div style={{ width:"100%", height:160 }}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top:8, right:8, bottom:0, left:-20 }}>
                <XAxis dataKey="date" tick={{ fontFamily:FS, fontSize:10, fill:MU }} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{ fontFamily:FS, fontSize:10, fill:MU }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ fontFamily:FS, fontSize:12, borderRadius:8, border:`1px solid ${BR}` }} formatter={(v) => [`${v}`, "Density Score"]}/>
                <ReferenceLine y={85} stroke="rgba(21,128,61,.3)" strokeDasharray="4 3" label={{ value:"Normal", position:"right", fontFamily:FS, fontSize:9, fill:"#14532D" }}/>
                <Line type="monotone" dataKey="score" stroke={G} strokeWidth={2.5} dot={{ fill:G, r:4, strokeWidth:0 }} activeDot={{ r:6 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Before / After slider */}
        {oldest.thumb && latest.thumb && oldest.id !== latest.id && (
          <div style={{ ...card({ padding:0, overflow:"hidden", marginBottom:14 }) }}>
            <div style={{ padding:"12px 16px 10px" }}>
              <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase" }}>Before / After</div>
              <div style={{ fontFamily:FS, fontSize:11, color:DM, marginTop:3 }}>Drag to compare · {new Date(oldest.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} → {new Date(latest.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
            </div>
            <div
              style={{ position:"relative", height:240, cursor:"ew-resize", userSelect:"none", touchAction:"none" }}
              onMouseMove={e => { const r=e.currentTarget.getBoundingClientRect(); setSliderPos(Math.max(5,Math.min(95,((e.clientX-r.left)/r.width)*100))); }}
              onTouchMove={e => { const r=e.currentTarget.getBoundingClientRect(); const t=e.touches[0]; setSliderPos(Math.max(5,Math.min(95,((t.clientX-r.left)/r.width)*100))); }}>
              {/* Before (left) */}
              <img src={oldest.compare || oldest.thumb} alt="before"
                style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}/>
              {/* After (right, clipped) */}
              <div style={{ position:"absolute", inset:0, overflow:"hidden", clipPath:`inset(0 0 0 ${sliderPos}%)` }}>
                <img src={latest.compare || latest.thumb} alt="after"
                  style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}/>
              </div>
              {/* Divider line */}
              <div style={{ position:"absolute", top:0, bottom:0, left:`${sliderPos}%`, width:2, background:"white", boxShadow:"0 0 8px rgba(0,0,0,.4)", transform:"translateX(-50%)" }}/>
              {/* Handle */}
              <div style={{ position:"absolute", top:"50%", left:`${sliderPos}%`, transform:"translate(-50%,-50%)",
                width:36, height:36, borderRadius:"50%", background:"white",
                boxShadow:"0 2px 8px rgba(0,0,0,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:FS, fontSize:12, color:G, letterSpacing:"-2px" }}>‹›</span>
              </div>
              {/* Labels */}
              <div style={{ position:"absolute", top:8, left:8, fontFamily:FS, fontSize:10, fontWeight:600,
                background:"rgba(0,0,0,.55)", color:"white", padding:"3px 8px", borderRadius:6 }}>Before</div>
              <div style={{ position:"absolute", top:8, right:8, fontFamily:FS, fontSize:10, fontWeight:600,
                background:"rgba(0,0,0,.55)", color:"white", padding:"3px 8px", borderRadius:6 }}>After</div>
            </div>
          </div>
        )}

        {/* MaxGraft candidacy */}
        {candidacy && renderCandidacyBadge(candidacy)}

        {/* Scan history */}
        <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Scan History</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[...scans].reverse().map((s, i) => {
            const sc   = s.result?.densityScore;
            const prev = i < scans.length-1 ? scans[scans.length-2-i]?.result?.densityScore : null;
            const diff = sc && prev ? sc - prev : null;
            return (
              <div key={s.id} onClick={() => { setHairResult(s.result); setHairAngles({crown:s.thumb,hairline:null,leftTemple:null,rightTemple:null}); setHairPhase("results"); setHairTab("analyse"); }}
                style={{ ...card({ padding:0, overflow:"hidden", cursor:"pointer" }) }}>
                <div style={{ display:"flex", gap:12, padding:"12px 16px", alignItems:"center" }}>
                  <img src={s.thumb} style={{ width:48, height:48, borderRadius:8, objectFit:"cover", flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:FF, fontSize:14, fontStyle:"italic", color:TX, marginBottom:3 }}>
                      {(s.result?.findings||[])[0]?.condition || "Hair Analysis"}
                    </div>
                    <div style={{ fontFamily:FS, fontSize:11, color:MU }}>
                      {new Date(s.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontFamily:FF, fontSize:22, color:G, lineHeight:1 }}>{sc ?? "—"}</div>
                    {diff !== null && (
                      <div style={{ fontFamily:FS, fontSize:10, color: diff>0?"#14532D":"#B91C1C", marginTop:2 }}>
                        {diff>0?`▲+${diff}`:`▼${diff}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGlp1Banner = () => (
    <div style={{ padding:"12px 16px", borderRadius:12, background:"rgba(124,45,18,.06)",
      border:"1px solid rgba(124,45,18,.25)", marginBottom:14 }}>
      <div style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:"#7C2D12", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>⚠ GLP-1 Hair Loss Protocol</div>
      <div style={{ fontFamily:FS, fontSize:12, color:"#7F1D1D", lineHeight:1.65 }}>
        GLP-1 medications can trigger temporary hair shedding — typically peaking at 3–4 months after starting. Most patients see recovery at 6+ months. Prevention-first protocols (exosomes, peptides, topicals) are recommended before considering surgical options.
      </div>
    </div>
  );

  const renderCandidacyBadge = (c) => (
    <div style={{ padding:"14px 16px", borderRadius:12, background:c.bg, border:`1px solid ${c.br}`, marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:18, color:c.color }}>{c.icon}</span>
        <div>
          <div style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:c.color, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:4 }}>MaxGraft / FUE Candidacy</div>
          <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:c.color, marginBottom:4 }}>{c.label}</div>
          <div style={{ fontFamily:FS, fontSize:12, color:c.color, opacity:.85, lineHeight:1.55 }}>{c.sub}</div>
        </div>
      </div>
    </div>
  );

  /* ── Hair Intake Form ─────────────────────────────────────────────── */
  const renderHairIntake = () => {
    const upd = (k, v) => setHairIntake(p => ({ ...p, [k]:v }));
    const toggleTx = (t) => setHairIntake(p => ({
      ...p,
      prevTreatments: p.prevTreatments.includes(t)
        ? p.prevTreatments.filter(x => x !== t)
        : [...p.prevTreatments, t]
    }));

    const saveAndContinue = async () => {
      const hp = { ...hairIntake, completedAt: new Date().toISOString() };
      setHairProfile(hp);
      await storage.set("glow:hairProfile", JSON.stringify(hp));
      setHairIntakeStep(0);
    };

    const SEL = (val, cur, onSel, label) => (
      <button onClick={() => onSel(val)}
        style={{ padding:"9px 14px", borderRadius:10, fontFamily:FS, fontSize:13, cursor:"pointer",
          background: cur===val ? G : "white",
          border: `1px solid ${cur===val ? G : BR}`,
          color: cur===val ? "white" : TX,
          transition:"all .15s" }}>
        {label}
      </button>
    );

    const MULTI = (val, arr, onTog, label) => (
      <button onClick={() => onTog(val)}
        style={{ padding:"8px 13px", borderRadius:10, fontFamily:FS, fontSize:13, cursor:"pointer",
          background: arr.includes(val) ? "rgba(44,74,114,.1)" : "white",
          border: `1px solid ${arr.includes(val) ? G : BR}`,
          color: arr.includes(val) ? G : TX,
          transition:"all .15s" }}>
        {label}
      </button>
    );

    return (
      <div style={{ display:"flex", flexDirection:"column", padding:"24px 0 64px", width:"100%", maxWidth:520 }}>
        {/* Progress dots */}
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:28 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: i===hairIntakeStep?24:8, height:8, borderRadius:4,
              background: i<=hairIntakeStep ? G : BR, transition:"all .3s" }} />
          ))}
        </div>

        {hairIntakeStep === 0 && (<>
          <div style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, marginBottom:6, fontStyle:"italic" }}>About You</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:24, lineHeight:1.5 }}>
            This helps us calibrate your density score against what's typical for your profile.
          </div>

          <div style={{ fontFamily:FS, fontSize:11, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Biological sex</div>
          <div style={{ display:"flex", gap:10, marginBottom:24 }}>
            {SEL("male",   hairIntake.sex, v=>upd("sex",v), "Male")}
            {SEL("female", hairIntake.sex, v=>upd("sex",v), "Female")}
          </div>

          <div style={{ fontFamily:FS, fontSize:11, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Family history of hair loss</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24 }}>
            {SEL("none",  hairIntake.familyHistory, v=>upd("familyHistory",v), "None")}
            {SEL("one",   hairIntake.familyHistory, v=>upd("familyHistory",v), "One parent")}
            {SEL("both",  hairIntake.familyHistory, v=>upd("familyHistory",v), "Both parents")}
            {SEL("unsure",hairIntake.familyHistory, v=>upd("familyHistory",v), "Unsure")}
          </div>

          <button onClick={() => setHairIntakeStep(1)} disabled={!hairIntake.sex || !hairIntake.familyHistory}
            style={{ padding:"15px", borderRadius:12, border:"none", cursor: hairIntake.sex&&hairIntake.familyHistory?"pointer":"default",
              background: hairIntake.sex&&hairIntake.familyHistory ? `linear-gradient(130deg,#1A2B4A,${G})` : "rgba(44,74,114,.12)",
              fontFamily:FF, fontSize:15, fontStyle:"italic",
              color: hairIntake.sex&&hairIntake.familyHistory ? "white" : DM, letterSpacing:"0.06em" }}>
            Next →
          </button>
        </>)}

        {hairIntakeStep === 1 && (<>
          <div style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, marginBottom:6, fontStyle:"italic" }}>Your Hair History</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:24, lineHeight:1.5 }}>
            Understanding how long you've noticed changes helps us assess progression rate.
          </div>

          <div style={{ fontFamily:FS, fontSize:11, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:10 }}>How long have you noticed thinning?</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24 }}>
            {SEL("recent","",()=>{},"")}
            {SEL("recent", hairIntake.duration, v=>upd("duration",v), "Just started")}
            {SEL("1-2",    hairIntake.duration, v=>upd("duration",v), "1–2 years")}
            {SEL("3-5",    hairIntake.duration, v=>upd("duration",v), "3–5 years")}
            {SEL("5+",     hairIntake.duration, v=>upd("duration",v), "5+ years")}
          </div>

          <div style={{ display:"flex", gap:10, marginTop:4 }}>
            <button onClick={() => setHairIntakeStep(0)}
              style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${BR}`, background:"white", fontFamily:FS, fontSize:13, color:MU, cursor:"pointer" }}>← Back</button>
            <button onClick={() => setHairIntakeStep(2)} disabled={!hairIntake.duration}
              style={{ flex:2, padding:"13px", borderRadius:12, border:"none", cursor:"pointer",
                background: hairIntake.duration ? `linear-gradient(130deg,#1A2B4A,${G})` : "rgba(44,74,114,.12)",
                fontFamily:FF, fontSize:15, fontStyle:"italic",
                color: hairIntake.duration ? "white" : DM, letterSpacing:"0.06em" }}>
              Next →
            </button>
          </div>
        </>)}

        {hairIntakeStep === 2 && (<>
          <div style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, marginBottom:6, fontStyle:"italic" }}>Previous Treatments</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, marginBottom:24, lineHeight:1.5 }}>
            Select all that apply. This helps us recommend what you haven't tried yet.
          </div>

          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:28 }}>
            {["None","Minoxidil","Finasteride / Dutasteride","PRP","Exosomes","LLLT / Laser cap","Hair transplant","Other"].map(t => (
              <div key={t}>{MULTI(t, hairIntake.prevTreatments, toggleTx, t)}</div>
            ))}
          </div>

          <div style={{ ...card({ padding:"14px 16px", marginBottom:24, background:"rgba(44,74,114,.04)" }) }}>
            <div style={{ fontFamily:FS, fontSize:11, color:G, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Your Profile Summary</div>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {[
                ["Sex", hairIntake.sex === "male" ? "Male" : "Female"],
                ["Family history", hairIntake.familyHistory === "both" ? "Both parents" : hairIntake.familyHistory === "one" ? "One parent" : hairIntake.familyHistory === "unsure" ? "Unsure" : "None"],
                ["Thinning duration", hairIntake.duration === "recent" ? "Just started" : hairIntake.duration === "1-2" ? "1–2 years" : hairIntake.duration === "3-5" ? "3–5 years" : "5+ years"],
                ["Hair goals", (profile?.hairGoals||[]).length ? profile.hairGoals.join(", ") : "None set in profile"],
              ].map(([label, val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontFamily:FS, fontSize:12, color:MU }}>{label}</span>
                  <span style={{ fontFamily:FS, fontSize:12, color:TX, fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setHairIntakeStep(1)}
              style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${BR}`, background:"white", fontFamily:FS, fontSize:13, color:MU, cursor:"pointer" }}>← Back</button>
            <button onClick={saveAndContinue}
              style={{ flex:2, padding:"13px", borderRadius:12, border:"none", cursor:"pointer",
                background:`linear-gradient(130deg,#1A2B4A,${G})`,
                fontFamily:FF, fontSize:15, fontStyle:"italic", color:"white", letterSpacing:"0.06em" }}>
              Start Analysis →
            </button>
          </div>
        </>)}
      </div>
    );
  };

  /* ── Hair Results Renderer ────────────────────────────────────────── */
  const renderHairResults = () => {
    if (!hairResult) return null;
    const findings    = hairResult.findings || [];
    const densityScore = hairResult.densityScore || null;
    const scoreColor  = !densityScore ? MU
      : densityScore >= 85 ? "#14532D"
      : densityScore >= 70 ? "#7C2D12"
      : densityScore >= 55 ? "#C2410C"
      : "#B91C1C";
    const scoreLabel  = !densityScore ? "—"
      : densityScore >= 85 ? "Normal"
      : densityScore >= 70 ? "Mildly Reduced"
      : densityScore >= 55 ? "Moderately Reduced"
      : densityScore >= 40 ? "Significantly Reduced"
      : "Severe Loss";
    const worstU   = findings.reduce((w,f)=>{const o=["routine","soon","urgent","emergency"];return o.indexOf(f.urgency)>o.indexOf(w)?f.urgency:w},"routine");
    const topUrg   = SEV_ORDER[worstU] ? { label:["No Concern","Early Intervention","Active Restoration","Consult Today"][["routine","soon","urgent","emergency"].indexOf(worstU)], tx:["#14532D","#7C2D12","#C2410C","#B91C1C"][["routine","soon","urgent","emergency"].indexOf(worstU)], bg:["rgba(21,128,61,.1)","rgba(146,64,14,.1)","rgba(194,65,12,.1)","rgba(185,28,28,.1)"][["routine","soon","urgent","emergency"].indexOf(worstU)], br:["rgba(21,128,61,.3)","rgba(146,64,14,.3)","rgba(194,65,12,.3)","rgba(185,28,28,.3)"][["routine","soon","urgent","emergency"].indexOf(worstU)] } : {label:"No Concern",tx:"#14532D",bg:"rgba(21,128,61,.1)",br:"rgba(21,128,61,.3)"};
    const URG_MAP  = {routine:{label:"Preventive",tx:"#14532D",bg:"rgba(21,128,61,.1)",br:"rgba(21,128,61,.3)"},soon:{label:"Early Intervention",tx:"#7C2D12",bg:"rgba(146,64,14,.1)",br:"rgba(146,64,14,.3)"},urgent:{label:"Active Restoration",tx:"#C2410C",bg:"rgba(194,65,12,.1)",br:"rgba(194,65,12,.3)"},emergency:{label:"Consult Today",tx:"#B91C1C",bg:"rgba(185,28,28,.1)",br:"rgba(185,28,28,.3)"}};
    return (
      <div style={{ padding:"16px 0 32px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <button onClick={() => { setHairResult(null); setHairAngles({ crown:null, hairline:null, leftTemple:null, rightTemple:null }); setMonoContext(""); setHairPhase("upload"); }} style={{ background:"none", border:"none", fontFamily:FS, fontSize:13, color:MU, cursor:"pointer", padding:0 }}>← New Analysis</button>
        </div>
        <div style={{ ...card({ padding:0, overflow:"hidden", marginBottom:14 }) }}>
          {hairAngles.crown && <img src={hairAngles.crown} style={{ width:"100%", display:"block", maxHeight:240, objectFit:"cover" }}/>}
          <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontFamily:FS, fontSize:12, color:MU }}>{findings.length} finding{findings.length!==1?"s":""} identified</div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:12, background:topUrg.bg, border:`1px solid ${topUrg.br}` }}>
              <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:topUrg.tx }}>{topUrg.label}</span>
            </div>
          </div>
        </div>

        {/* Density Score Card */}
        {densityScore && (
          <div style={{ ...card({ padding:"16px", marginBottom:14 }) }}>
            {secLabel("Hair Density Score")}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                <span style={{ fontFamily:FF, fontSize:52, color:scoreColor, lineHeight:1, fontWeight:300 }}>{densityScore}</span>
                <div>
                  <div style={{ fontFamily:FS, fontSize:12, color:scoreColor, fontWeight:600 }}>{scoreLabel}</div>
                  <div style={{ fontFamily:FS, fontSize:9, color:DM, letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>out of 100</div>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                {[["Normal","#14532D",85,101],["Mild","#7C2D12",70,85],["Moderate","#C2410C",55,70],["Severe","#B91C1C",0,55]].map(([label,color,min,max]) => {
                  const active = densityScore >= min && densityScore < max;
                  return (
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background: active ? color : "rgba(0,0,0,.1)" }} />
                      <span style={{ fontFamily:FS, fontSize:10, color: active ? color : DM, fontWeight: active ? 600 : 400 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop:12, height:4, borderRadius:2, background:"rgba(44,74,114,.1)" }}>
              <div style={{ height:4, borderRadius:2, background:scoreColor, width:`${densityScore}%`, transition:"width .6s ease", opacity:.8 }} />
            </div>

            {/* Typical range timeline (when hair profile exists) */}
            {(() => {
              if (!hairProfile) return null;
              const typ = hairTypicalRange(profile?.age, hairProfile.sex, hairProfile.familyHistory, hairProfile.duration);
              if (!typ) return null;
              const pos = (v) => `${Math.max(0, Math.min(100, v))}%`;
              const inRange = densityScore >= typ.lo && densityScore <= typ.hi;
              const above   = densityScore > typ.hi;
              const rangeColor = inRange ? "#14532D" : above ? "#14532D" : "#B91C1C";
              return (
                <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${BR}` }}>
                  <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:12 }}>
                    Compared to Typical Range
                  </div>
                  {/* Track */}
                  <div style={{ position:"relative", height:6, borderRadius:3, background:"rgba(44,74,114,.08)", margin:"18px 0 28px" }}>
                    {/* Typical range bracket */}
                    <div style={{ position:"absolute", left:pos(typ.lo), width:`${typ.hi - typ.lo}%`,
                      height:"100%", background:"rgba(44,74,114,.2)", borderRadius:3 }} />
                    {/* Score dot */}
                    <div style={{ position:"absolute", left:pos(densityScore), top:"50%",
                      transform:"translate(-50%,-50%)", width:14, height:14,
                      borderRadius:"50%", background:scoreColor, border:"2px solid white",
                      boxShadow:"0 1px 4px rgba(0,0,0,.2)", zIndex:2 }} />
                    {/* Bracket labels */}
                    <div style={{ position:"absolute", top:10, left:pos(typ.lo), transform:"translateX(-50%)", fontFamily:FS, fontSize:10, color:MU }}>{typ.lo}</div>
                    <div style={{ position:"absolute", top:10, left:pos(typ.hi), transform:"translateX(-50%)", fontFamily:FS, fontSize:10, color:MU }}>{typ.hi}</div>
                  </div>
                  {/* Verdict */}
                  <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:12,
                    background: inRange ? "rgba(21,128,61,.1)" : above ? "rgba(21,128,61,.1)" : "rgba(185,28,28,.1)",
                    border: `1px solid ${inRange||above ? "rgba(21,128,61,.3)" : "rgba(185,28,28,.3)"}` }}>
                    <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:rangeColor }}>
                      {above ? "✓ Above typical range for your profile"
                        : inRange ? "✓ Within typical range for your profile"
                        : "↓ Below typical range for your profile"}
                    </span>
                  </div>
                  <div style={{ fontFamily:FS, fontSize:10, color:DM, marginTop:8, fontStyle:"italic" }}>
                    Typical {hairProfile.sex} · {hairProfile.familyHistory === "both" ? "strong" : hairProfile.familyHistory === "one" ? "moderate" : "no"} family history · {profile?.age ? `age ${profile.age}` : ""}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {findings.map((f,i) => {
          const u = URG_MAP[f.urgency]||URG_MAP.routine;
          const sel = selectedId===f.id;
          return (
            <div key={f.id} onClick={()=>setSelectedId(sel?null:f.id)} style={{ ...card({ padding:0, overflow:"hidden", marginBottom:12, border:sel?`2px solid ${u.tx}`:`1px solid ${BR}` }) }}>
              <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:10, background:sel?u.bg:"white", cursor:"pointer" }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:u.tx, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FS, fontSize:12, fontWeight:700, color:"white" }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:FF, fontSize:17, fontStyle:"italic", color:TX, lineHeight:1.2 }}>{f.condition}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                    <div style={{ display:"inline-flex", padding:"2px 8px", borderRadius:10, background:u.bg, border:`1px solid ${u.br}` }}><span style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:u.tx }}>{u.label}</span></div>
                    <span style={{ fontFamily:FS, fontSize:10, color:MU }}>{f.confidence} confidence</span>
                  </div>
                </div>
                <span style={{ color:MU, fontSize:14 }}>{sel?"▲":"▼"}</span>
              </div>
              {sel && (
                <div style={{ padding:"14px 16px", borderTop:`1px solid ${BR}` }}>
                  <p style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.7, margin:"0 0 12px" }}>{f.description}</p>
                  {f.prognosis && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(185,28,28,.04)", border:"1px solid rgba(185,28,28,.18)", marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, color:"#B91C1C", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>Without Treatment</div><p style={{ fontFamily:FS, fontSize:13, color:"#7F1D1D", lineHeight:1.6, margin:0 }}>{f.prognosis}</p></div>}
                  {f.characteristics?.length>0 && <div style={{ marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:8 }}>Observed</div>{f.characteristics.map((c,j)=><div key={j} style={{ display:"flex", gap:7, marginBottom:5 }}><span style={{ color:G, flexShrink:0 }}>◈</span><span style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.5 }}>{c}</span></div>)}</div>}
                  {f.selfCare?.length>0 && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(21,128,61,.04)", border:"1px solid rgba(21,128,61,.18)", marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, color:"#14532D", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Self-Care</div>{f.selfCare.map((s,j)=><div key={j} style={{ display:"flex", gap:7, marginBottom:5 }}><span style={{ color:"#14532D", flexShrink:0 }}>✓</span><span style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.5 }}>{s}</span></div>)}</div>}
                  {f.clinicalNote && <p style={{ fontFamily:FS, fontSize:12, color:MU, fontStyle:"italic", margin:"0 0 12px", lineHeight:1.6, padding:"8px 12px", borderRadius:8, background:SURF }}>📋 {f.clinicalNote}</p>}
                  {f.treatments?.length>0 && (
                    <div style={{ paddingTop:12, borderTop:`1px solid ${BR}` }}>
                      <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:G, textTransform:"uppercase", marginBottom:10 }}>Treatment Options</div>
                      {f.treatments.map((t,j)=>{ const tier=TIER_COLOR[t.tier]||TIER_COLOR.premium; const dt=dtCol(t.downtime); return <div key={j} style={{ padding:"12px 14px", borderRadius:10, background:"rgba(44,74,114,.04)", border:`1px solid rgba(44,74,114,.15)`, marginBottom:8 }}><div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:6 }}><div style={{ flex:1 }}><div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:TX, lineHeight:1.2 }}>{t.procedure}</div><div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}><span style={{ fontFamily:FS, fontSize:10, padding:"2px 8px", borderRadius:10, background:tier.bg, border:`1px solid ${tier.br}`, color:tier.tx, fontWeight:600 }}>{tier.label}</span>{t.downtime&&<span style={{ fontFamily:FS, fontSize:10, padding:"2px 8px", borderRadius:10, background:dt.bg, border:`1px solid ${dt.br}`, color:dt.tx }}>{t.downtime==="None"?"No downtime":t.downtime}</span>}</div></div>{t.price&&<div style={{ fontFamily:FF, fontSize:15, fontStyle:"italic", color:G, flexShrink:0 }}>{t.price}</div>}</div>{t.description&&<p style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.6, margin:"4px 0 0" }}>{t.description}</p>}{t.why&&<p style={{ fontFamily:FS, fontSize:11, color:G, lineHeight:1.5, margin:"4px 0 0", fontStyle:"italic" }}>Why it helps: {t.why}</p>}</div>})}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ padding:"11px 14px", borderRadius:10, background:"rgba(44,74,114,.05)", border:`1px solid rgba(44,74,114,.15)` }}>
          <p style={{ fontFamily:FS, fontSize:11, color:MU, lineHeight:1.65, margin:0 }}><strong>Educational purposes only.</strong> Not a medical diagnosis. Consult a qualified trichologist or hair restoration specialist.</p>
        </div>
      </div>
    );
  };

  /* ── Skin Check History ───────────────────────────────────────────── */
  const renderSkinHistory = () => {
    const URG_MAP = {routine:{label:"No Concern",tx:"#14532D",bg:"rgba(21,128,61,.1)",br:"rgba(21,128,61,.3)"},soon:{label:"See Doctor Soon",tx:"#7C2D12",bg:"rgba(146,64,14,.1)",br:"rgba(146,64,14,.3)"},urgent:{label:"See Doctor Promptly",tx:"#C2410C",bg:"rgba(194,65,12,.1)",br:"rgba(194,65,12,.3)"},emergency:{label:"Seek Care Today",tx:"#B91C1C",bg:"rgba(185,28,28,.1)",br:"rgba(185,28,28,.3)"}};
    if (dermHistory.length === 0) return (
      <div style={{ textAlign:"center", padding:"48px 20px" }}>
        <div style={{ fontSize:40, marginBottom:16, opacity:.3 }}>✦</div>
        <div style={{ fontFamily:FF, fontSize:20, fontStyle:"italic", color:MU, marginBottom:8 }}>No skin checks yet</div>
        <div style={{ fontFamily:FS, fontSize:13, color:DM, lineHeight:1.6, marginBottom:24 }}>Each check is saved here so you can revisit findings and track changes over time.</div>
        <button onClick={() => setSkinTab("analyse")}
          style={{ padding:"12px 28px", borderRadius:10, border:"none",
            background:`linear-gradient(130deg,#1A2B4A,${G})`,
            fontFamily:FF, fontSize:15, fontStyle:"italic", color:"white", cursor:"pointer" }}>
          Start First Check →
        </button>
      </div>
    );
    return (
      <div style={{ padding:"8px 0 32px" }}>
        <div style={{ fontFamily:FS, fontSize:12, color:MU, marginBottom:14, lineHeight:1.6 }}>
          Each check may cover a different area of skin — tap any entry to revisit its full findings.
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {dermHistory.map(entry => {
            const findings = entry.result?.findings || [];
            const worstU = findings.reduce((w,f)=>{const o=["routine","soon","urgent","emergency"];return o.indexOf(f.urgency)>o.indexOf(w)?f.urgency:w},"routine");
            const u = URG_MAP[worstU] || URG_MAP.routine;
            return (
              <div key={entry.id} onClick={() => { setSkinResult(entry.result); setMonoPreview(entry.compare || entry.thumb); setSkinPhase("results"); setSkinTab("analyse"); setSelectedId(null); }}
                style={{ ...card({ padding:0, overflow:"hidden", cursor:"pointer" }) }}>
                <div style={{ display:"flex", gap:12, padding:"12px 16px", alignItems:"center" }}>
                  <img src={entry.thumb} style={{ width:48, height:48, borderRadius:8, objectFit:"cover", flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:FF, fontSize:14, fontStyle:"italic", color:TX, marginBottom:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {findings[0]?.condition || "Skin Check"}{findings.length > 1 ? ` +${findings.length-1}` : ""}
                    </div>
                    <div style={{ fontFamily:FS, fontSize:11, color:MU }}>
                      {new Date(entry.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · {findings.length} finding{findings.length!==1?"s":""}
                    </div>
                  </div>
                  <div style={{ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:12, background:u.bg, border:`1px solid ${u.br}`, flexShrink:0 }}>
                    <span style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:u.tx }}>{u.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── Skin Check Results Renderer ──────────────────────────────────── */
  const renderSkinResults = () => {
    if (!skinResult) return null;
    const findings = skinResult.findings || [];
    const URG_MAP  = {routine:{label:"No Immediate Concern",tx:"#14532D",bg:"rgba(21,128,61,.1)",br:"rgba(21,128,61,.3)",icon:"✓"},soon:{label:"See a Doctor Soon",tx:"#7C2D12",bg:"rgba(146,64,14,.1)",br:"rgba(146,64,14,.3)",icon:"◷"},urgent:{label:"See a Doctor Promptly",tx:"#C2410C",bg:"rgba(194,65,12,.1)",br:"rgba(194,65,12,.3)",icon:"◷"},emergency:{label:"Seek Care Today",tx:"#B91C1C",bg:"rgba(185,28,28,.1)",br:"rgba(185,28,28,.3)",icon:"⚠"}};
    const worstU   = findings.reduce((w,f)=>{const o=["routine","soon","urgent","emergency"];return o.indexOf(f.urgency)>o.indexOf(w)?f.urgency:w},"routine");
    const topUrg   = URG_MAP[worstU];
    return (
      <div style={{ padding:"16px 0 32px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <button onClick={() => { setSkinResult(null); setMonoPreview(null); setMonoContext(""); setSkinPhase("upload"); }} style={{ background:"none", border:"none", fontFamily:FS, fontSize:13, color:MU, cursor:"pointer", padding:0 }}>← New Check</button>
        </div>
        <div style={{ ...card({ padding:0, overflow:"hidden", marginBottom:14 }) }}>
          {monoPreview && <img src={monoPreview} style={{ width:"100%", display:"block", maxHeight:240, objectFit:"cover" }}/>}
          <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontFamily:FS, fontSize:12, color:MU }}>{findings.length} finding{findings.length!==1?"s":""} identified</div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:12, background:topUrg.bg, border:`1px solid ${topUrg.br}` }}>
              <span style={{ fontSize:11, color:topUrg.tx }}>{topUrg.icon}</span>
              <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:topUrg.tx }}>{topUrg.label}</span>
            </div>
          </div>
        </div>
        {findings.map((f,i) => {
          const u = URG_MAP[f.urgency]||URG_MAP.routine;
          const sel = selectedId===f.id;
          return (
            <div key={f.id} onClick={()=>setSelectedId(sel?null:f.id)} style={{ ...card({ padding:0, overflow:"hidden", marginBottom:12, border:sel?`2px solid ${u.tx}`:`1px solid ${BR}` }) }}>
              <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:10, background:sel?u.bg:"white", cursor:"pointer" }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:u.tx, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FS, fontSize:12, fontWeight:700, color:"white" }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:FF, fontSize:17, fontStyle:"italic", color:TX, lineHeight:1.2 }}>{f.condition}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                    <div style={{ display:"inline-flex", padding:"2px 8px", borderRadius:10, background:u.bg, border:`1px solid ${u.br}` }}><span style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:u.tx }}>{u.label}</span></div>
                    <span style={{ fontFamily:FS, fontSize:10, color:MU }}>{f.confidence} confidence</span>
                  </div>
                </div>
                <span style={{ color:MU, fontSize:14 }}>{sel?"▲":"▼"}</span>
              </div>
              {sel && (
                <div style={{ padding:"14px 16px", borderTop:`1px solid ${BR}` }}>
                  <p style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.7, margin:"0 0 12px" }}>{f.description}</p>
                  {f.differential?.length>0 && <div style={{ marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:8 }}>Also Possible</div><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{f.differential.map(d=><span key={d} style={{ fontFamily:FS, fontSize:12, padding:"3px 9px", borderRadius:8, background:SURF, border:`1px solid ${BR}`, color:MU }}>{d}</span>)}</div></div>}
                  {f.characteristics?.length>0 && <div style={{ marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:MU, textTransform:"uppercase", marginBottom:8 }}>Observed</div>{f.characteristics.map((c,j)=><div key={j} style={{ display:"flex", gap:7, marginBottom:5 }}><span style={{ color:G, flexShrink:0 }}>◈</span><span style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.5 }}>{c}</span></div>)}</div>}
                  {f.selfCare?.length>0 && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(21,128,61,.04)", border:"1px solid rgba(21,128,61,.18)", marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, color:"#14532D", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Self-Care</div>{f.selfCare.map((s,j)=><div key={j} style={{ display:"flex", gap:7, marginBottom:5 }}><span style={{ color:"#14532D", flexShrink:0 }}>✓</span><span style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.5 }}>{s}</span></div>)}</div>}
                  {f.seekCareWhen && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(44,74,114,.04)", marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.1em", color:G, textTransform:"uppercase", marginBottom:6 }}>When to See a Dermatologist</div><p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.6, margin:0 }}>{f.seekCareWhen}</p></div>}
                  {f.redFlags?.length>0 && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(185,28,28,.04)", border:"1px solid rgba(185,28,28,.2)", marginBottom:12 }}><div style={{ fontFamily:FS, fontSize:10, color:"#B91C1C", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>⚠ Seek Immediate Care If</div>{f.redFlags.map((r,j)=><div key={j} style={{ display:"flex", gap:7, marginBottom:5 }}><span style={{ color:"#B91C1C", flexShrink:0 }}>!</span><span style={{ fontFamily:FS, fontSize:13, color:"#7F1D1D", lineHeight:1.5 }}>{r}</span></div>)}</div>}
                  {f.clinicalNote && <p style={{ fontFamily:FS, fontSize:12, color:MU, fontStyle:"italic", margin:"0 0 12px", lineHeight:1.6, padding:"8px 12px", borderRadius:8, background:SURF }}>📋 {f.clinicalNote}</p>}
                  {f.treatments?.length>0 && (
                    <div style={{ paddingTop:12, borderTop:`1px solid ${BR}` }}>
                      <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:G, textTransform:"uppercase", marginBottom:10 }}>Treatment Options</div>
                      {f.treatments.map((t,j)=>{ const tier=TIER_COLOR[t.tier]||TIER_COLOR.premium; const dt=dtCol(t.downtime); return <div key={j} style={{ padding:"12px 14px", borderRadius:10, background:"rgba(44,74,114,.04)", border:`1px solid rgba(44,74,114,.15)`, marginBottom:8 }}><div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:6 }}><div style={{ flex:1 }}><div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:TX, lineHeight:1.2 }}>{t.procedure}</div><div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}><span style={{ fontFamily:FS, fontSize:10, padding:"2px 8px", borderRadius:10, background:tier.bg, border:`1px solid ${tier.br}`, color:tier.tx, fontWeight:600 }}>{tier.label}</span>{t.downtime&&<span style={{ fontFamily:FS, fontSize:10, padding:"2px 8px", borderRadius:10, background:dt.bg, border:`1px solid ${dt.br}`, color:dt.tx }}>{t.downtime==="None"?"No downtime":t.downtime}</span>}</div></div>{t.price&&<div style={{ fontFamily:FF, fontSize:15, fontStyle:"italic", color:G, flexShrink:0 }}>{t.price}</div>}</div>{t.description&&<p style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.6, margin:"4px 0 0" }}>{t.description}</p>}{t.why&&<p style={{ fontFamily:FS, fontSize:11, color:G, lineHeight:1.5, margin:"4px 0 0", fontStyle:"italic" }}>Why it helps: {t.why}</p>}</div>})}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ padding:"11px 14px", borderRadius:10, background:"rgba(44,74,114,.05)", border:`1px solid rgba(44,74,114,.15)` }}>
          <p style={{ fontFamily:FS, fontSize:11, color:MU, lineHeight:1.65, margin:0 }}><strong>Educational purposes only.</strong> Not a medical diagnosis. Consult a qualified dermatologist.</p>
        </div>
      </div>
    );
  };

  const renderResults = (a, preview) => {
    if (!a) return null;
    const { skinType, fitzpatrickType: analyzedFitz, overallAssessment, analysisConfidence, confidenceNote, positives = [],
            photoTips=[], concerns: rawConcerns=[], recommendations=[] } = a;
    const concerns = [...rawConcerns].sort((a,b)=>(SEV_ORDER[b.severity]||0)-(SEV_ORDER[a.severity]||0));
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
    const summaryTab = () => {
      // Skin Health Score
      const scoreDeductions = concerns.reduce((t,c) =>
        t + (c.severity==="Significant"?18:c.severity==="Moderate"?10:4), 0);
      const score      = Math.max(10, 100 - scoreDeductions);
      const scoreColor = score >= 80 ? "#14532D" : score >= 60 ? "#7C2D12" : "#B91C1C";
      const scoreLabel = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 55 ? "Fair" : score >= 40 ? "Needs Attention" : "Significant Concerns";

      const hr = new Date().getHours();
      const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

      return (
      <div style={{ padding:"20px 0 24px" }}>
        <div style={{ fontFamily:FF, fontSize:15, fontStyle:"italic", color:MU,
          marginBottom:14, letterSpacing:"0.04em" }}>
          {greeting}{profile?.name ? `, ${profile.name.trim().split(" ")[0]}` : ""}.
        </div>
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:20 }}>
          {preview && (
            <div style={{ width:88, flexShrink:0, borderRadius:10, overflow:"hidden", border:`1px solid ${BR}`, aspectRatio:"3/4" }}>
              <img src={preview} alt="Analysis" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", display:"block" }}/>
            </div>
          )}
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", gap:7, marginBottom:10, flexWrap:"wrap" }}>
              {pill(`${skinType} Skin`, true)}
            </div>
            <p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.7, marginBottom:12 }}>{overallAssessment}</p>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:fitz.swatch, border:"1.5px solid rgba(255,255,255,.15)", boxShadow:"0 0 0 2px rgba(44,74,114,.18)", flexShrink:0 }} />
              <div>
                <div style={{ fontFamily:FS, fontSize:12, color:TX, lineHeight:1.3 }}>{fitz.label} <span style={{ color:MU }}>· {fitzpatrickType}</span></div>
                <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:2 }}>{fitz.sun}</div>
              </div>
            </div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", background:"rgba(44,74,114,.07)", border:"1px solid rgba(44,74,114,.18)", borderRadius:5, marginTop:9 }}>
              <span style={{ fontSize:10 }}>☀</span>
              <span style={{ fontFamily:FS, fontSize:10, color:G }}>{fitz.spf}</span>
            </div>
          </div>
        </div>

        {positives && positives.length > 0 && (
          <div style={{ ...card({ padding:"14px 16px", marginBottom:12 }) }}>
            <div style={{ fontFamily:FS, fontSize:11, fontWeight:600, letterSpacing:"0.12em", color:"#14532D", textTransform:"uppercase", marginBottom:10 }}>Skin Strengths</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {positives.map((p, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:"rgba(21,128,61,.13)", border:"1px solid rgba(21,128,61,.35)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                    <span style={{ fontSize:10, color:"#14532D" }}>✓</span>
                  </div>
                  <span style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.5 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* SPF Reminder */}
        <div style={{ ...card({ padding:"13px 16px", marginBottom:12,
          background:"rgba(44,74,114,.05)", border:"1px solid rgba(44,74,114,.2)" }) }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22, flexShrink:0 }}>☀</span>
            <div>
              <div style={{ fontFamily:FS, fontSize:10, fontWeight:600, letterSpacing:"0.12em", color:G, textTransform:"uppercase", marginBottom:3 }}>Daily SPF</div>
              <div style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.45 }}>{fitz.spf}</div>
              <div style={{ fontFamily:FS, fontSize:11, color:MU, marginTop:3 }}>{fitz.label} skin — {fitz.sun.toLowerCase()}</div>
              <div style={{ fontFamily:FS, fontSize:10, color:DM, marginTop:4, fontStyle:"italic" }}>
                Recommendation based on {profile?.fitzpatrickType ? "your self-identified" : "AI-identified"} {fitzpatrickType}
              </div>
            </div>
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

        {/* Skin Metrics — Score + Age grouped */}
        <div style={{ ...card({ padding:"16px", marginBottom:0, borderRadius:"12px 12px 0 0" }) }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              {secLabel("Skin Metrics")}
              <div style={{ display:"flex", alignItems:"baseline", gap:10, marginTop:6 }}>
                <span style={{ fontFamily:FF, fontSize:52, color:scoreColor, lineHeight:1, fontWeight:300 }}>{score}</span>
                <span style={{ fontFamily:FS, fontSize:11, color:scoreColor, fontWeight:600, letterSpacing:"0.08em" }}>{scoreLabel}</span>
                  <div style={{ fontFamily:FS, fontSize:9, color:DM, letterSpacing:"0.1em", textTransform:"uppercase", marginTop:3 }}>Health Score</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
              {["Significant","Moderate","Mild"].map(s => {
                const n = concerns.filter(c=>c.severity===s).length;
                if (!n) return null;
                const sv = SEV[s];
                return (
                  <div key={s} onClick={() => setActiveTab("concerns")}
                    className="hcard"
                    style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"2px 4px", borderRadius:6, transition:"background .15s" }}>
                    <span style={{ fontFamily:FS, fontSize:11, color:sv.tx, fontWeight:500 }}>{n}</span>
                    <span style={{ fontFamily:FS, fontSize:10, padding:"2px 7px", background:sv.bg, border:`1px solid ${sv.br}`, borderRadius:4, color:sv.tx }}>
                      {s} →
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop:10, height:4, borderRadius:2, background:"rgba(44,74,114,.1)" }}>
            <div style={{ height:4, borderRadius:2, background:scoreColor, width:`${score}%`, transition:"width .6s ease", opacity:.75 }} />
          </div>
        </div>

        {/* Skin Age */}
        {a.skinAge && (() => {
          const actual   = profile?.age ? parseInt(profile.age) : null;
          const est      = a.skinAge;
          const diff     = actual ? actual - est : null;
          const diffAbs  = diff !== null ? Math.abs(diff) : null;
          const color    = diff === null ? G
                         : diff >= 4  ? "#14532D"
                         : diff <= -4 ? "#B91C1C"
                         : "#7C2D12";
          const label    = diff === null ? null
                         : diff >= 4  ? `${diffAbs} yrs younger`
                         : diff <= -4 ? `${diffAbs} yrs older`
                         : diff === 0 ? "Exact match" : "On track";

          // Typical delta (est - actual) range by Fitzpatrick type
          const TYPICAL = {
            "Type I":   { low:-2, high:6  }, "Type II":  { low:-2, high:5  },
            "Type III": { low:-3, high:3  }, "Type IV":  { low:-4, high:2  },
            "Type V":   { low:-5, high:1  }, "Type VI":  { low:-5, high:0  },
          };
          const typ      = TYPICAL[fitzpatrickType] || { low:-3, high:3 };
          const estDelta = actual ? est - actual : null;
          const inRange  = estDelta !== null && estDelta >= typ.low && estDelta <= typ.high;

          // Timeline bounds
          const ages  = actual ? [est, actual] : [est];
          const tlMin = Math.max(15, Math.min(...ages) - 10);
          const tlMax = Math.min(80, Math.max(...ages) + 10);
          const tlRng = tlMax - tlMin;
          const PAD   = 4;
          const TW    = 100 - PAD * 2;
          const pos   = v => `${(PAD + Math.max(0, Math.min(1, (v - tlMin) / tlRng)) * TW).toFixed(1)}%`;
          const segW  = (a, b) => `${(Math.abs(b - a) / tlRng * TW).toFixed(1)}%`;
          const typLo = actual ? Math.max(tlMin, actual + typ.low)  : null;
          const typHi = actual ? Math.min(tlMax, actual + typ.high) : null;

          return (
<div style={{ ...card({ padding:"16px", marginTop:0, borderRadius:"0 0 12px 12px", borderTop:"none" }) }}>
              {secLabel("Skin Age")}

              {/* Numbers + delta badge */}
              <div style={{ display:"flex", alignItems:"center", marginBottom:24 }}>
                <div style={{ flex:1, textAlign:"center" }}>
                  <div style={{ fontFamily:FF, fontSize:52, color, lineHeight:1, fontWeight:300 }}>{est}</div>
                  <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:3, letterSpacing:"0.08em" }}>Estimated</div>
                </div>
                {actual && label && (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"0 8px" }}>
                    <div style={{ width:1, height:18, background:BR }} />
                    <div style={{ padding:"3px 11px", borderRadius:12, background:`${color}18`, border:`1px solid ${color}44` }}>
                      <span style={{ fontFamily:FS, fontSize:11, color, fontWeight:600 }}>{label}</span>
                    </div>
                    <div style={{ width:1, height:18, background:BR }} />
                  </div>
                )}
                {actual && (
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ fontFamily:FF, fontSize:52, color:TX, lineHeight:1, fontWeight:300 }}>{actual}</div>
                    <div style={{ fontFamily:FS, fontSize:10, color:MU, marginTop:3, letterSpacing:"0.08em" }}>Actual</div>
                  </div>
                )}
              </div>

              {/* Timeline track */}
              <div style={{ position:"relative", height:84, marginBottom:8 }}>
                {/* Base track */}
                <div style={{ position:"absolute", top:16, left:`${PAD}%`, right:`${PAD}%`, height:4, background:"rgba(44,74,114,.1)", borderRadius:2 }} />
                {/* Typical band on track */}
                {actual && typLo !== null && typHi !== null && (
                  <div style={{ position:"absolute", top:12, height:12, borderRadius:4,
                    left:pos(typLo), width:segW(typLo, typHi),
                    background:"rgba(44,74,114,.1)", border:"1px solid rgba(44,74,114,.22)" }} />
                )}
                {/* Colored segment est ↔ actual */}
                {actual && diffAbs > 0 && (
                  <div style={{ position:"absolute", top:16, height:4, borderRadius:2, opacity:0.75,
                    left:pos(Math.min(est,actual)), width:segW(Math.min(est,actual), Math.max(est,actual)),
                    background:color }} />
                )}
                {/* Estimated dot */}
                <div style={{ position:"absolute", top:8, left:pos(est), transform:"translateX(-50%)",
                  width:16, height:16, borderRadius:"50%", background:color,
                  border:"2.5px solid white", boxShadow:"0 1px 4px rgba(0,0,0,.22)" }} />
                {/* Actual dot */}
                {actual && (
                  <div style={{ position:"absolute", top:8, left:pos(actual), transform:"translateX(-50%)",
                    width:16, height:16, borderRadius:"50%", background:TX,
                    border:"2.5px solid white", boxShadow:"0 1px 4px rgba(0,0,0,.22)" }} />
                )}
                {/* Dot value labels */}
                <div style={{ position:"absolute", top:28, left:pos(est), transform:"translateX(-50%)" }}>
                  <span style={{ fontFamily:FS, fontSize:9, color, fontWeight:500 }}>{est}</span>
                </div>
                {actual && (
                  <div style={{ position:"absolute", top:28, left:pos(actual), transform:"translateX(-50%)" }}>
                    <span style={{ fontFamily:FS, fontSize:9, color:MU }}>{actual}</span>
                  </div>
                )}

                {/* Typical range bracket — sits below dots, arms drop from track */}
                {actual && typLo !== null && typHi !== null && (
                  <>
                    {/* Left arm */}
                    <div style={{ position:"absolute", top:39, left:pos(typLo), transform:"translateX(-50%)",
                      width:1.5, height:16, background:"rgba(44,74,114,.45)" }} />
                    {/* Right arm */}
                    <div style={{ position:"absolute", top:39, left:pos(typHi), transform:"translateX(-50%)",
                      width:1.5, height:16, background:"rgba(44,74,114,.45)" }} />
                    {/* Horizontal bracket line */}
                    <div style={{ position:"absolute", top:54, height:1.5, borderRadius:1,
                      left:pos(typLo), width:segW(typLo, typHi),
                      background:"rgba(44,74,114,.45)" }} />
                    {/* Left bracket end value */}
                    <div style={{ position:"absolute", top:57, left:pos(typLo), transform:"translateX(-50%)", textAlign:"center" }}>
                      <span style={{ fontFamily:FS, fontSize:10, color:TX, fontWeight:500 }}>{typLo}</span>
                    </div>
                    {/* Right bracket end value */}
                    <div style={{ position:"absolute", top:57, left:pos(typHi), transform:"translateX(-50%)", textAlign:"center" }}>
                      <span style={{ fontFamily:FS, fontSize:10, color:TX, fontWeight:500 }}>{typHi}</span>
                    </div>
                    {/* Center bracket label */}
                    <div style={{ position:"absolute", top:68, left:pos((typLo+typHi)/2), transform:"translateX(-50%)", textAlign:"center", whiteSpace:"nowrap" }}>
                      <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:10,
                        background: inRange ? "rgba(21,128,61,.12)" : estDelta > typ.high ? "rgba(185,28,28,.1)" : "rgba(21,128,61,.12)",
                        border: `1px solid ${inRange ? "rgba(21,128,61,.3)" : estDelta > typ.high ? "rgba(185,28,28,.3)" : "rgba(21,128,61,.3)"}` }}>
                        <span style={{ fontFamily:FS, fontSize:10, fontWeight:600, letterSpacing:"0.06em",
                          color: inRange ? "#14532D" : estDelta > typ.high ? "#B91C1C" : "#14532D" }}>
                          {fitzpatrickType} typical{inRange ? " ✓" : estDelta > typ.high ? " ↑" : " ↓"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {!actual && (
                <div style={{ fontFamily:FS, fontSize:11, color:DM, marginTop:10, textAlign:"center" }}>
                  Add your age in your profile to compare against your skin type's typical range.
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );

    };

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

            {(() => {
              const sc = concerns.reduce((a,c)=>{ a[c.severity]=(a[c.severity]||0)+1; return a; },{});
              const parts = ["Significant","Moderate","Mild"].filter(s=>sc[s])
                .map(s=><span key={s} style={{ fontFamily:FS, fontSize:12, color:SEV[s].tx }}>
                  <span style={{ fontWeight:600 }}>{sc[s]}</span> {s}
                </span>);
              return parts.length > 0 ? (
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${BR}`, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:DM, textTransform:"uppercase", marginRight:4 }}>Concerns</span>
                  {parts.reduce((a,e,i)=>[...a, i>0 && <span key={i} style={{ color:DM, fontSize:10 }}>·</span>, e],[])}
                </div>
              ) : null;
            })()}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10, marginBottom:10, flexWrap:"wrap" }}>
              <span style={{ fontFamily:FS, fontSize:9, color:DM, letterSpacing:"0.12em", textTransform:"uppercase", marginRight:2 }}>AI Detection Confidence</span>
              {[["High","#14532D"],["Medium","#7C2D12"],["Low","#B91C1C"]].map(([lbl,col]) => (
                <div key={lbl} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <ConfidenceBars level={lbl} />
                  <span style={{ fontFamily:FS, fontSize:9, color:col }}>{lbl}</span>
                </div>
              ))}
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
    const RecCard = ({ rec, color, alpha, icon, label }) => {
      // Downtime semantic colours
      const dt = rec.downtime || "None";
      const dtS = dt === "None" || dt === ""
        ? { tx:"#14532D", bg:"rgba(21,128,61,.1)",  br:"rgba(21,128,61,.3)",  icon:"✓" }
        : dt.includes("1-2 d")
        ? { tx:"#7C2D12", bg:"rgba(146,64,14,.1)", br:"rgba(146,64,14,.3)", icon:"◷" }
        : dt.includes("3-5")
        ? { tx:"#C2410C", bg:"rgba(194,65,12,.1)", br:"rgba(194,65,12,.3)", icon:"◷" }
        : { tx:"#B91C1C", bg:"rgba(185,28,28,.1)", br:"rgba(185,28,28,.3)", icon:"◷" };
      const dtLabel = dt === "None" || dt === "" ? "No downtime" : dt + " recovery";

      return (
        <div className="rcard" style={{ ...card({ padding:0, overflow:"hidden" }) }}>
          {/* Header */}
          <div style={{ padding:"10px 16px", background:`rgba(${alpha},.08)`, borderBottom:`1px solid rgba(${alpha},.18)`, display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.13em", color, textTransform:"uppercase", fontWeight:500 }}>{icon} {label}</span>
          </div>

          <div style={{ padding:"13px 16px" }}>
            {/* Procedure + price row */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:4 }}>
              <div style={{ fontFamily:FF, fontSize:20, color:TX, flex:1, lineHeight:1.2 }}>{rec.procedure}</div>
              {(rec.price || rec.priceRange) && (
                <div style={{ flexShrink:0, textAlign:"right" }}>
                  <div style={{ fontFamily:FF, fontSize:18, fontStyle:"italic", color, lineHeight:1, fontWeight:400 }}>
                    {rec.price || rec.priceRange}
                  </div>
                  {rec.tier === "premium" && !(rec.price||"").toLowerCase().includes("session") && (
                    <div style={{ fontFamily:FS, fontSize:9, color:MU, marginTop:2, letterSpacing:"0.06em" }}>per session</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ fontFamily:FS, fontSize:11, color, marginBottom:8 }}>{rec.category}</div>
            <div style={{ fontFamily:FS, fontSize:13, color:MU, lineHeight:1.65, marginBottom:9 }}>{rec.description}</div>
            <div style={{ fontFamily:FS, fontSize:12, color:TX, lineHeight:1.6, padding:"8px 12px", background:`rgba(${alpha},.05)`, border:`1px solid rgba(${alpha},.14)`, borderRadius:7, marginBottom:10 }}>
              <span style={{ color }}>Why it helps: </span>{rec.howItHelps}
            </div>

            {/* Downtime badge — semantic colour + prominent */}
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px",
                background:dtS.bg, border:`1px solid ${dtS.br}`, borderRadius:12 }}>
                <span style={{ fontSize:11, color:dtS.tx }}>{dtS.icon}</span>
                <span style={{ fontFamily:FS, fontSize:11, fontWeight:500, color:dtS.tx }}>{dtLabel}</span>
              </div>
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
    };

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
                  const sv  = SEV[c.severity]||SEV.Mild;
                  const cnt = recommendations.filter(r=>(r.targetConcernIds||[]).includes(c.id)).length;
                  return (
                    <button key={c.id} onClick={() => { setSelectedConcernId(c.id); }}
                      style={{ padding:"5px 12px", borderRadius:16, border:`1px solid ${sv.br}`, background:sv.bg,
                        fontFamily:FS, fontSize:11, color:sv.tx, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                      {c.name}
                      {cnt > 0 && <span style={{ fontFamily:FS, fontSize:10, color:sv.tx, opacity:.7 }}>({cnt})</span>}
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
              {/* Auto Before/After — oldest vs latest */}
              {history.length >= 2 && compareIds.length === 0 && (() => {
                const sorted = [...history].sort((a,b) => new Date(a.date)-new Date(b.date));
                const oldF = sorted[0], newF = sorted[sorted.length-1];
                if (!oldF.thumb || !newF.thumb) return null;
                return (
                  <div style={{ marginBottom:20 }}>
                    <BeforeAfterSlider
                      beforeSrc={oldF.compare || oldF.thumb} afterSrc={newF.compare || newF.thumb}
                      beforeLabel={fmtDate(oldF.date)} afterLabel={fmtDate(newF.date)}
                      beforeScore={healthScore(oldF.concerns)} afterScore={healthScore(newF.concerns)}
                    />
                    <div style={{ fontFamily:FS, fontSize:11, color:DM, textAlign:"center", marginTop:8, lineHeight:1.6 }}>
                      Drag to compare your first and latest analysis<br/>
                      <span style={{ color:G }}>Tap any two analyses below to compare a specific pair</span>
                    </div>
                  </div>
                );
              })()}

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
                          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                            <span style={{ fontFamily:FF, fontSize:15, color:TX }}>{entry.skinType}</span>
                            {(() => {
                              const sc = (entry.concerns||[]).reduce((t,c)=>t+(c.severity==="Significant"?18:c.severity==="Moderate"?10:4),0);
                              const s  = Math.max(10, 100-sc);
                              const cl = s>=80?"#14532D":s>=60?"#7C2D12":"#B91C1C";
                              return <span style={{ fontFamily:FS, fontSize:10, color:cl, fontWeight:600 }}>{s}</span>;
                            })()}
                          </div>
                          {entry.overallAssessment && (
                            <div style={{ fontFamily:FS, fontSize:11, color:MU, lineHeight:1.5, marginBottom:5 }}>{entry.overallAssessment}</div>
                          )}
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                            {(entry.concerns||[]).slice(0,3).map((c,i) => {
                              const sv = SEV[c.severity]||SEV.Mild;
                              return <span key={i} style={{ fontFamily:FS, fontSize:10, padding:"2px 7px", background:sv.bg, border:`1px solid ${sv.br}`, borderRadius:4, color:sv.tx }}>{c.name}</span>;
                            })}
                            {(entry.concerns||[]).length > 3 && <span style={{ fontFamily:FS, fontSize:10, color:DM }}>+{entry.concerns.length-3} more</span>}
                          </div>
                        </div>
                        {deletingId === entry.id ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0, alignItems:"flex-end" }}>
                            <span style={{ fontFamily:FS, fontSize:10, color:MU, marginBottom:2 }}>Delete scan?</span>
                            <button className="lbtn" onClick={() => deleteFromHistory(entry.id)}
                              style={{ padding:"5px 10px", borderRadius:6, background:"rgba(185,28,28,.1)", border:"1px solid rgba(185,28,28,.35)", fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:"#B91C1C", textTransform:"uppercase", cursor:"pointer" }}>
                              Delete
                            </button>
                            <button className="lbtn" onClick={() => setDeletingId(null)}
                              style={{ padding:"5px 10px", borderRadius:6, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0 }}>
                            <button className="lbtn" onClick={() => { setAnalysis(entry); setAngles({ front:{ preview:entry.thumb, b64:entry.thumb.split(",")[1] }, left:null, right:null }); setFromHistory(true); setActiveTab("summary"); }}
                              style={{ padding:"5px 10px", borderRadius:6, background:"transparent", border:`1px solid ${BR}`, fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:MU, textTransform:"uppercase", cursor:"pointer" }}>View</button>
                            <button className="lbtn" onClick={() => toggle(entry.id)}
                              style={{ padding:"5px 10px", borderRadius:6, background:isSel?"rgba(44,74,114,.15)":"transparent", border:`1px solid ${isSel?G:BR}`, fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:isSel?G:MU, textTransform:"uppercase", cursor:"pointer" }}>
                              {isSel ? "✓ Sel" : "Select"}
                            </button>
                            <button className="lbtn" onClick={() => setDeletingId(entry.id)}
                              style={{ padding:"5px 10px", borderRadius:6, background:"transparent", border:"1px solid rgba(185,28,28,.25)", fontFamily:FS, fontSize:10, letterSpacing:"0.06em", color:"#B91C1C", textTransform:"uppercase", cursor:"pointer" }}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button className="lbtn" onClick={() => { setAngles({front:null,left:null,right:null}); setAnalysis(null); setFromHistory(false); setQuality(null); setPhase("upload"); }}
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
          const sevWorst  = concerns.some(c=>c.severity==="Significant") ? "Significant"
                          : concerns.some(c=>c.severity==="Moderate") ? "Moderate"
                          : concerns.length ? "Mild" : null;
          const badgeColor= sevWorst==="Significant"?"#B91C1C":sevWorst==="Moderate"?"#7C2D12":sevWorst==="Mild"?"#A16207":G;
          const badge     = tab.key === "progress" && history.length > 0 && !isActive ? history.length
                          : tab.key === "concerns"  && concerns.length  > 0 && !isActive ? concerns.length
                          : 0;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex:1, padding:"10px 4px 12px", display:"flex", flexDirection:"row", alignItems:"center", justifyContent:"center", gap:5,
                background:"none", border:"none", cursor:"pointer", position:"relative",
                borderTop: isActive ? `2px solid ${G}` : "2px solid transparent", transition:"border-color .15s" }}>
              <span style={{ fontSize:15, color: isActive ? G : DM, lineHeight:1, transition:"color .15s" }}>{tab.icon}</span>
              <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: isActive ? G : MU, textTransform:"uppercase", transition:"color .15s" }}>{tab.label}</span>
              {badge > 0 && (
                <div style={{ position:"absolute", top:7, left:"calc(50% + 6px)", minWidth:14, height:14, borderRadius:7, background: tab.key==="concerns" ? badgeColor : G, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                  <span style={{ fontFamily:FS, fontSize:8, fontWeight:700, color:"#F7F4F0" }}>{badge > 9 ? "9+" : badge}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    );

    return (
      <div className="up0" style={{ paddingBottom:8 }}>
        {/* Top action row */}
        <div style={{ display:"flex", justifyContent:"flex-end", paddingTop:14, marginBottom:-6 }}>
          <button onClick={() => { setAngles({front:null,left:null,right:null}); setAnalysis(null); setFromHistory(false); setQuality(null); setPhase("upload"); }}
            style={{ padding:"7px 14px", borderRadius:8, background:"transparent", border:`1px solid ${BR}`,
              fontFamily:FS, fontSize:11, letterSpacing:"0.08em", color:G, textTransform:"uppercase", cursor:"pointer", fontWeight:600 }}>
            + New Analysis
          </button>
        </div>
        {activeTab === "summary"    && summaryTab()}
        {activeTab === "concerns"   && concernsTab()}
        {activeTab === "treatments" && treatmentsTab()}
        {activeTab === "progress"   && progressTab()}
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
              beforeSrc={older.compare || older.thumb} afterSrc={newer.compare || newer.thumb}
              beforeLabel={fmtDate(older.date)} afterLabel={fmtDate(newer.date)}
              beforeScore={healthScore(older.concerns)} afterScore={healthScore(newer.concerns)}
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

  /* ── Provider location ─────────────────────────────────────────── */
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

  /* ── Home Tab ─────────────────────────────────────────────────────── */
  const renderHomeTab = () => {
    const hr = new Date().getHours();
    const greeting = hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
    const firstName = profile?.name ? profile.name.trim().split(" ")[0] : null;

    // Face score from latest analysis
    const faceScore = analysis ? (() => {
      const concerns = analysis.concerns || [];
      const ded = concerns.reduce((t,c)=>t+(c.severity==="Significant"?18:c.severity==="Moderate"?10:4),0);
      return Math.max(10, 100-ded);
    })() : null;
    const faceColor = faceScore ? (faceScore>=80?"#14532D":faceScore>=60?"#7C2D12":"#B91C1C") : MU;

    // Latest hair result
    const latestHair = hairHistory.length > 0 ? hairHistory[0] : null;
    const latestSkin = dermHistory.length > 0 ? dermHistory[0] : null;

    const URG_HAIR = {routine:{tx:"#14532D",label:"Preventive"},soon:{tx:"#7C2D12",label:"Early Intervention"},urgent:{tx:"#C2410C",label:"Active Loss"},emergency:{tx:"#B91C1C",label:"Consult Today"}};
    const URG_SKIN = {routine:{tx:"#14532D",label:"No Concern"},soon:{tx:"#7C2D12",label:"See Doctor Soon"},urgent:{tx:"#C2410C",label:"See Doctor Promptly"},emergency:{tx:"#B91C1C",label:"Seek Care Today"}};

    return (
      <div style={{ padding:"24px 0 32px" }}>
        {/* Greeting */}
        <div style={{ fontFamily:FF, fontSize:17, fontStyle:"italic", color:MU, marginBottom:24 }}>
          {greeting}{firstName ? `, ${firstName}` : ""}.
        </div>

        {/* Face card */}
        <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Face Analysis</div>
        {analysis ? (
          <div onClick={() => { setAppTab("face"); if(phase!=="results") setPhase("results"); }}
            className="hcard" style={{ ...card({ padding:"16px", marginBottom:20 }), display:"flex", alignItems:"center", gap:16 }}>
            {angles?.front?.preview && <img src={angles.front.preview} style={{ width:52, height:52, borderRadius:10, objectFit:"cover", flexShrink:0 }} />}
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                <span style={{ fontFamily:FF, fontSize:36, color:faceColor, lineHeight:1 }}>{faceScore}</span>
                <span style={{ fontFamily:FS, fontSize:12, color:faceColor, fontWeight:600 }}>/100</span>
                <span style={{ fontFamily:FS, fontSize:12, color:MU }}>Skin Health</span>
              </div>
              <div style={{ fontFamily:FS, fontSize:12, color:MU, lineHeight:1.4 }}>{analysis.skinType} · {(analysis.concerns||[]).length} concern{(analysis.concerns||[]).length!==1?"s":""}</div>
            </div>
            <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
          </div>
        ) : (
          <div onClick={() => setAppTab("face")} className="hcard"
            style={{ ...card({ padding:"16px", marginBottom:20, border:`2px dashed ${BR}`, background:"rgba(44,74,114,.02)" }), display:"flex", alignItems:"center", gap:14, cursor:"pointer" }}>
            <span style={{ fontSize:26, color:DM, flexShrink:0 }}>◎</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:MU }}>Start a Face Analysis</div>
              <div style={{ fontFamily:FS, fontSize:12, color:DM, marginTop:2 }}>Skin health score, concerns & treatments</div>
            </div>
            <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
          </div>
        )}

        {/* Hair card */}
        <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Hair & Scalp</div>
        {latestHair ? (() => {
          const findings = latestHair.result?.findings || [];
          const top = findings[0];
          const wu = findings.reduce((w,f)=>{const o=["routine","soon","urgent","emergency"];return o.indexOf(f.urgency)>o.indexOf(w)?f.urgency:w},"routine");
          const uc = URG_HAIR[wu]||URG_HAIR.routine;
          return (
            <div onClick={() => { setAppTab("hair"); setHairPhase("results"); setHairResult(latestHair.result); }}
              className="hcard" style={{ ...card({ padding:"16px", marginBottom:20 }), display:"flex", alignItems:"center", gap:16 }}>
              {latestHair.thumb && <img src={latestHair.thumb} style={{ width:52, height:52, borderRadius:10, objectFit:"cover", flexShrink:0 }} />}
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                  <span style={{ fontFamily:FF, fontSize:28, color:uc.tx, lineHeight:1, fontWeight:300 }}>{latestHair.result?.densityScore || "—"}</span>
                  {latestHair.result?.densityScore && <span style={{ fontFamily:FS, fontSize:11, color:uc.tx, fontWeight:600 }}>Density</span>}
                </div>
                <div style={{ fontFamily:FF, fontSize:14, fontStyle:"italic", color:TX, marginBottom:4 }}>{top?.condition || "Hair Analysis"}</div>
                <span style={{ fontFamily:FS, fontSize:11, padding:"2px 8px", borderRadius:10, background:"rgba(44,74,114,.08)", border:`1px solid rgba(44,74,114,.2)`, color:uc.tx }}>{uc.label}</span>
              </div>
              <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
            </div>
          );
        })() : (
          <div onClick={() => setAppTab("hair")} className="hcard"
            style={{ ...card({ padding:"16px", marginBottom:20, border:`2px dashed ${BR}`, background:"rgba(44,74,114,.02)" }), display:"flex", alignItems:"center", gap:14, cursor:"pointer" }}>
            <span style={{ fontSize:26, color:DM, flexShrink:0 }}>◈</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:MU }}>Start a Hair Analysis</div>
              <div style={{ fontFamily:FS, fontSize:12, color:DM, marginTop:2 }}>Norwood/Ludwig classification & restoration plan</div>
            </div>
            <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
          </div>
        )}

        {/* Skin card */}
        <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:MU, textTransform:"uppercase", marginBottom:10 }}>Skin Check</div>
        {latestSkin ? (() => {
          const findings = latestSkin.result?.findings || [];
          const top = findings[0];
          const wu = findings.reduce((w,f)=>{const o=["routine","soon","urgent","emergency"];return o.indexOf(f.urgency)>o.indexOf(w)?f.urgency:w},"routine");
          const uc = URG_SKIN[wu]||URG_SKIN.routine;
          return (
            <div onClick={() => { setAppTab("skin"); setSkinPhase("results"); setSkinResult(latestSkin.result); setMonoPreview(latestSkin.compare || latestSkin.thumb); }}
              className="hcard" style={{ ...card({ padding:"16px", marginBottom:20 }), display:"flex", alignItems:"center", gap:16 }}>
              {latestSkin.thumb && <img src={latestSkin.thumb} style={{ width:52, height:52, borderRadius:10, objectFit:"cover", flexShrink:0 }} />}
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:FF, fontSize:15, fontStyle:"italic", color:TX, marginBottom:4 }}>{top?.condition || "Skin Check"}{findings.length>1?` +${findings.length-1}`:""}</div>
                <span style={{ fontFamily:FS, fontSize:11, padding:"2px 8px", borderRadius:10, background:"rgba(44,74,114,.08)", border:`1px solid rgba(44,74,114,.2)`, color:uc.tx }}>{uc.label}</span>
              </div>
              <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
            </div>
          );
        })() : (
          <div onClick={() => setAppTab("skin")} className="hcard"
            style={{ ...card({ padding:"16px", marginBottom:20, border:`2px dashed ${BR}`, background:"rgba(44,74,114,.02)" }), display:"flex", alignItems:"center", gap:14, cursor:"pointer" }}>
            <span style={{ fontSize:26, color:DM, flexShrink:0 }}>✦</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:FF, fontSize:16, fontStyle:"italic", color:MU }}>Start a Skin Check</div>
              <div style={{ fontFamily:FS, fontSize:12, color:DM, marginTop:2 }}>Identify a specific skin concern anywhere on the body</div>
            </div>
            <span style={{ fontFamily:FS, fontSize:18, color:DM }}>→</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes scan{0%,100%{top:0%}50%{top:94%}}
        @keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes dot{0%,60%,100%{opacity:.2}30%{opacity:1}}
        @keyframes irisOrbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes irisPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
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
      <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:110, background:"#1A2B4A", padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:0 }} onClick={reset}>
          <div>
            <div style={{ display:"flex", alignItems:"center", lineHeight:1, gap:0, marginBottom:4 }}>
              <span style={{ fontFamily:FF, fontSize:26, fontWeight:500, letterSpacing:"0.14em", color:"white", fontStyle:"italic" }}>Gl</span>
              <svg width="30" height="33" viewBox="0 0 60 66" style={{ display:"block", margin:"0 2px", flexShrink:0, verticalAlign:"middle" }}>
                <circle cx="30" cy="33" r="22" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2"/>
                <circle cx="30" cy="33" r="14" fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="5"/>
                <circle cx="30" cy="33" r="7"  fill="none" stroke="rgba(255,255,255,.58)" strokeWidth="3.5"/>
                <circle cx="30" cy="33" r="3.5" fill="white"/>
                <line x1="30" y1="11" x2="30" y2="4"  stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="52" y1="33" x2="59" y2="33" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="30" y1="55" x2="30" y2="62" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="8"  y1="33" x2="1"  y2="33" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily:FF, fontSize:26, fontWeight:500, letterSpacing:"0.14em", color:"white", fontStyle:"italic" }}>wIQ</span>
            </div>
            <div style={{ fontFamily:FS, fontSize:11, letterSpacing:"0.22em", color:"rgba(255,255,255,.78)", textTransform:"uppercase", textAlign:"right" }}>Skin Roadmap</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {saved && <span style={{ fontFamily:FS, fontSize:11, color:"#4ADE80", animation:"fadeIn .3s ease" }}>✓ Saved</span>}
          {phase === "analyzing" && <div style={{ width:18, height:18, borderRadius:"50%", border:"2px solid rgba(255,255,255,.5)", borderTopColor:"transparent", animation:"spin .8s linear infinite" }} />}
          {phase === "results" && (
            <button className="lbtn" onClick={reset}
              style={{ padding:"6px 13px", borderRadius:8, background:"transparent", border:"1px solid rgba(255,255,255,.3)", fontFamily:FS, fontSize:11, letterSpacing:"0.09em", color:"rgba(255,255,255,.8)", textTransform:"uppercase", cursor:"pointer" }}>
              + New
            </button>
          )}
          <button className="lbtn" onClick={() => { setProfileStep(0); const inProfile = phase === "onboarding" || phase === "profile"; setPhase(inProfile ? (analysis ? "results" : "upload") : "profile"); }}
            style={{ padding:"6px 13px", borderRadius:8,
              background:(phase==="onboarding"||phase==="profile")?"rgba(255,255,255,.15)":"transparent",
              border:`1px solid ${(phase==="onboarding"||phase==="profile")?"rgba(255,255,255,.6)":"rgba(255,255,255,.3)"}`,
              fontFamily:FS, fontSize:11, letterSpacing:"0.09em",
              color:(phase==="onboarding"||phase==="profile")?"white":"rgba(255,255,255,.8)",
              textTransform:"uppercase", cursor:"pointer" }}>
            {profile.completedAt ? "◎ Profile" : "◎ Setup"}
          </button>
        </div>
      </div>
      )}
      <div style={{ maxWidth:680, margin:"0 auto", padding: phase === "welcome" ? "0 22px 80px" : "86px 22px 140px" }}>
        {/* ── Modal overlays (profile/onboarding/misc) ── */}
        {phase === "welcome"       && renderWelcome()}
        {phase === "treatmentLog"   && renderTreatmentLog()}
        {phase === "onboarding" && renderOnboarding(false)}
        {phase === "profile"    && renderOnboarding(true)}
        {phase === "compare" && appTab === "face" && renderCompare()}

        {/* ── Tab content ── */}
        {(!["welcome","treatmentLog","onboarding","profile"].includes(phase) && !(phase==="compare" && appTab==="face")) && (<>
          {appTab === "home" && renderHomeTab()}

          {appTab === "face" && (<>
            {phase === "upload"    && renderUpload()}
            {phase === "analyzing" && renderAnalyzing()}
            {phase === "results"   && renderResults(analysis, angles?.front?.preview)}
          </>)}

          {appTab === "hair" && (<>
            {/* Analyse sub-tab */}
            {(hairTab === "analyse" || !hairProfile) && (<>
              {hairPhase === "upload" && !hairProfile && renderHairIntake()}
              {hairPhase === "upload" && hairProfile  && renderUpload()}
              {hairPhase === "analyzing" && renderAnalyzing()}
              {hairPhase === "results"   && renderHairResults()}
            </>)}
            {/* Progress sub-tab */}
            {hairTab === "progress" && hairProfile && hairPhase !== "analyzing" && renderHairProgress()}
          </>)}

          {appTab === "skin" && (<>
            {skinTab === "analyse" && (<>
              {skinPhase === "upload"    && renderUpload()}
              {skinPhase === "analyzing" && renderAnalyzing()}
              {skinPhase === "results"   && renderSkinResults()}
            </>)}
            {skinTab === "history" && skinPhase !== "analyzing" && renderSkinHistory()}
          </>)}
        </>)}
      </div>

      {/* ── Fixed bottom navigation stack ────────────────────────────── */}
      {!["welcome","onboarding","profile"].includes(phase) && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100,
          background:"white", boxShadow:"0 -2px 12px rgba(44,74,114,.08)" }}>

        {/* Row 1 — contextual sub-tabs */}
        {appTab === "face" && phase === "results" && analysis && (
          <div style={{ display:"flex", borderTop:`1px solid ${BR}`, background:BG }}>
            {[
              { key:"summary",    icon:"◎", label:"Summary"    },
              { key:"concerns",   icon:"◈", label:"Concerns"   },
              { key:"treatments", icon:"✦", label:"Treatments" },
              { key:"progress",   icon:"≋", label:"Progress"   },
            ].map(tab => {
              const isActive = activeTab === tab.key;
              const cns = analysis?.concerns || [];
              const badge = tab.key === "progress" && history.length > 0 && !isActive ? history.length
                          : tab.key === "concerns" && cns.length > 0 && !isActive ? cns.length : 0;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ flex:1, padding:"9px 4px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    background:"none", border:"none", cursor:"pointer", position:"relative",
                    borderTop: isActive ? `2px solid ${G}` : "2px solid transparent" }}>
                  <span style={{ fontSize:14, color: isActive ? G : DM, lineHeight:1 }}>{tab.icon}</span>
                  <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: isActive ? G : MU, textTransform:"uppercase" }}>{tab.label}</span>
                  {badge > 0 && (
                    <div style={{ position:"absolute", top:6, left:"calc(50% + 8px)", minWidth:14, height:14, borderRadius:7, background:G, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                      <span style={{ fontFamily:FS, fontSize:8, fontWeight:700, color:"white" }}>{badge > 9 ? "9+" : badge}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {appTab === "hair" && hairProfile && (
          <div style={{ display:"flex", borderTop:`1px solid ${BR}`, background:BG }}>
            {[["analyse","◈","Analyse"],["progress","≋","Progress"]].map(([key,icon,label]) => (
              <button key={key} onClick={() => hairPhase !== "analyzing" && setHairTab(key)}
                style={{ flex:1, padding:"9px 4px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  background:"none", border:"none", position:"relative",
                  cursor: hairPhase==="analyzing" ? "default" : "pointer",
                  opacity: hairPhase==="analyzing" ? .4 : 1,
                  borderTop: hairTab===key ? `2px solid ${G}` : "2px solid transparent" }}>
                <span style={{ fontSize:14, color: hairTab===key ? G : DM, lineHeight:1 }}>{icon}</span>
                <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: hairTab===key ? G : MU, textTransform:"uppercase" }}>{label}</span>
                {key==="progress" && hairHistory.length > 0 && hairTab!==key && (
                  <div style={{ position:"absolute", top:6, left:"calc(50% + 12px)", minWidth:14, height:14, borderRadius:7, background:G, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                    <span style={{ fontFamily:FS, fontSize:8, fontWeight:700, color:"white" }}>{hairHistory.length > 9 ? "9+" : hairHistory.length}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {appTab === "skin" && (
          <div style={{ display:"flex", borderTop:`1px solid ${BR}`, background:BG }}>
            {[["analyse","✦","Analyse"],["history","≋","History"]].map(([key,icon,label]) => (
              <button key={key} onClick={() => skinPhase !== "analyzing" && setSkinTab(key)}
                style={{ flex:1, padding:"9px 4px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  background:"none", border:"none", position:"relative",
                  cursor: skinPhase==="analyzing" ? "default" : "pointer",
                  opacity: skinPhase==="analyzing" ? .4 : 1,
                  borderTop: skinTab===key ? `2px solid ${G}` : "2px solid transparent" }}>
                <span style={{ fontSize:14, color: skinTab===key ? G : DM, lineHeight:1 }}>{icon}</span>
                <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: skinTab===key ? G : MU, textTransform:"uppercase" }}>{label}</span>
                {key==="history" && dermHistory.length > 0 && skinTab!==key && (
                  <div style={{ position:"absolute", top:6, left:"calc(50% + 12px)", minWidth:14, height:14, borderRadius:7, background:G, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                    <span style={{ fontFamily:FS, fontSize:8, fontWeight:700, color:"white" }}>{dermHistory.length > 9 ? "9+" : dermHistory.length}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Row 2 — app-level tabs */}
        <div style={{ borderTop:`1px solid ${BR}`,
          display:"flex", alignItems:"stretch" }}>
          {[
            { key:"home", icon:"⌂", label:"Home" },
            { key:"face", icon:"◎", label:"Face"  },
            { key:"hair", icon:"◈", label:"Hair"  },
            { key:"skin", icon:"✦", label:"Skin"  },
          ].map(({ key, icon, label }) => {
            const active = appTab === key;
            // Badge: show dot if that tab has results
            const hasDot = (key==="face"&&analysis) || (key==="hair"&&hairHistory.length>0) || (key==="skin"&&dermHistory.length>0);
            return (
              <button key={key}
                onClick={() => {
                  setAppTab(key);
                  setError(null);
                  // Leaving a modal phase (compare/treatmentLog) — restore results view
                  if (["compare","treatmentLog"].includes(phase)) { setPhase("results"); setCompareIds([]); }
                  // Navigate to results if available, else upload
                  if (key==="face") { if(analysis || history.length>0) { if(!analysis && history.length>0) { const l=[...history].sort((a,b)=>new Date(b.date)-new Date(a.date))[0]; setAnalysis(l); setAngles({front:{preview:l.thumb,b64:l.thumb.split(",")[1]},left:null,right:null}); setFromHistory(true); } setPhase("results"); } else setPhase("upload"); }
                  if (key==="hair") { if(hairHistory.length>0&&hairResult) setHairPhase("results"); }
                  if (key==="skin") { if(dermHistory.length>0&&skinResult) setSkinPhase("results"); }
                }}
                style={{ flex:1, padding:"10px 4px 14px", display:"flex", flexDirection:"column",
                  alignItems:"center", gap:3, background:"none", border:"none", cursor:"pointer",
                  position:"relative" }}>
                {hasDot && !active && (
                  <div style={{ position:"absolute", top:8, right:"calc(50% - 12px)", width:6, height:6, borderRadius:"50%", background:G }} />
                )}
                <span style={{ fontSize:18, color: active ? G : DM, lineHeight:1, transition:"color .15s" }}>{icon}</span>
                <span style={{ fontFamily:FS, fontSize:9, letterSpacing:"0.1em", color: active ? G : MU,
                  textTransform:"uppercase", transition:"color .15s", fontWeight: active ? 600 : 400 }}>{label}</span>
                {active && <div style={{ position:"absolute", bottom:0, left:"20%", right:"20%", height:2, borderRadius:"1px 1px 0 0", background:G }} />}
              </button>
            );
          })}
        </div>
        </div>
      )}
    {/* ── Floating Feedback Button ───────────────────────────────────── */}
    <div style={{ position:"fixed", bottom:118, right:16, zIndex:150 }}>
      <button onClick={() => setShowFeedback(true)}
        style={{ padding:"8px 14px", borderRadius:20, background:"#1A2B4A",
          border:"1px solid rgba(255,255,255,.22)", fontFamily:FS, fontSize:11,
          color:"rgba(255,255,255,.85)", cursor:"pointer", letterSpacing:"0.08em",
          boxShadow:"0 2px 12px rgba(26,43,74,.45)", display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:13 }}>◈</span> Feedback
      </button>
    </div>

    {/* ── Feedback Panel ──────────────────────────────────────────────── */}
    {showFeedback && (
      <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(14,20,35,.65)",
        display:"flex", alignItems:"flex-end", animation:"fadeIn .2s ease" }}
        onClick={() => setShowFeedback(false)}>
        <div style={{ width:"100%", background:"#1A2B4A", borderRadius:"20px 20px 0 0",
          padding:"6px 24px 48px", maxHeight:"80vh", overflowY:"auto" }}
          onClick={e => e.stopPropagation()}>
          {/* Handle */}
          <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 16px" }}>
            <div style={{ width:36, height:4, borderRadius:2, background:"rgba(255,255,255,.25)" }} />
          </div>

          {fbDone ? (
            <div style={{ textAlign:"center", padding:"32px 0" }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✓</div>
              <div style={{ fontFamily:FF, fontSize:18, fontStyle:"italic", color:"white", marginBottom:6 }}>Thank you</div>
              <div style={{ fontFamily:FS, fontSize:13, color:"rgba(255,255,255,.6)" }}>Your feedback has been received.</div>
            </div>
          ) : (
            <>
              <div style={{ fontFamily:FF, fontSize:20, fontStyle:"italic", color:"white", marginBottom:18 }}>Send Feedback</div>

              {/* Type chips */}
              <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:"rgba(255,255,255,.5)", textTransform:"uppercase", marginBottom:8 }}>Type</div>
              <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                {["Bug","Suggestion","General"].map(t => (
                  <button key={t} onClick={() => setFbType(t)}
                    style={{ padding:"6px 14px", borderRadius:14, fontFamily:FS, fontSize:11, cursor:"pointer",
                      background: fbType===t ? "rgba(255,255,255,.18)" : "transparent",
                      border: `1px solid ${fbType===t ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.2)"}`,
                      color: fbType===t ? "white" : "rgba(255,255,255,.55)" }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Message */}
              <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:"rgba(255,255,255,.5)", textTransform:"uppercase", marginBottom:8 }}>Message</div>
              <textarea value={fbMessage} onChange={e => setFbMessage(e.target.value)}
                placeholder="Describe what you noticed…"
                rows={4}
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,.2)",
                  background:"rgba(255,255,255,.07)", fontFamily:FS, fontSize:14, color:"white",
                  resize:"none", outline:"none", boxSizing:"border-box",
                  "::placeholder": { color:"rgba(255,255,255,.3)" } }} />

              {/* Screenshot */}
              <div style={{ fontFamily:FS, fontSize:10, letterSpacing:"0.12em", color:"rgba(255,255,255,.5)", textTransform:"uppercase", marginBottom:8, marginTop:16 }}>Screenshot (optional)</div>
              {fbShot ? (
                <div style={{ position:"relative", marginBottom:16 }}>
                  <img src={fbShot} alt="screenshot" style={{ width:"100%", borderRadius:8, border:"1px solid rgba(255,255,255,.15)" }} />
                  <button onClick={() => setFbShot(null)}
                    style={{ position:"absolute", top:6, right:6, width:24, height:24, borderRadius:"50%",
                      background:"rgba(0,0,0,.55)", border:"none", color:"white", fontSize:12, cursor:"pointer" }}>✕</button>
                </div>
              ) : (
                <label style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:10,
                  border:"1px dashed rgba(255,255,255,.22)", cursor:"pointer", marginBottom:16 }}>
                  <span style={{ fontFamily:FS, fontSize:12, color:"rgba(255,255,255,.55)" }}>Attach screenshot from camera roll</span>
                  <input type="file" accept="image/*" style={{ display:"none" }}
                    onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setFbShot(ev.target.result); r.readAsDataURL(f); }} />
                </label>
              )}

              {/* Submit */}
              <button onClick={submitFeedback} disabled={!fbMessage.trim() || fbSending}
                style={{ width:"100%", padding:"14px", borderRadius:10, border:"none", cursor:"pointer",
                  background: fbMessage.trim() ? "linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)" : "rgba(255,255,255,.1)",
                  fontFamily:FS, fontSize:13, color: fbMessage.trim() ? "#F7F4F0" : "rgba(255,255,255,.3)",
                  letterSpacing:"0.1em", textTransform:"uppercase" }}>
                {fbSending ? "Sending…" : "Send Feedback"}
              </button>
            </>
          )}
        </div>
      </div>
    )}

    </div>
    </>
  );
}



