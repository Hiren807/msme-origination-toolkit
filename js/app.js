/* =========================================================================
   app.js
   -------------------------------------------------------------------------
   Application state, persistence (localStorage + optional Firebase cloud
   sync), authentication (simulated), and every screen's render function
   plus its event handlers. This file wires dummy-data.js and
   calculations.js together into the interactive single-page app and
   boots the app at the very bottom (loadData() + render()).
   ========================================================================= */

function setRepoRate(newRate, date){
  const r = parseFloat(newRate);
  if(!isNaN(r) && r>0 && r<25){ RBI_REPO_RATE = r; RBI_REPO_LAST_UPDATED = date || new Date().toISOString().slice(0,10); saveData(); }
}

/* ===================== AUTH (prototype login — no real backend) ===================== */
let AUTH = { loggedIn:false, role:null, username:null, customerAppId:null };
function freshDocs(pattern){
  // pattern: object of key->status overrides; default Pending
  const d = {};
  DOC_LIST.forEach(doc=>{ d[doc.key] = (pattern && pattern[doc.key]) || "Pending"; });
  return d;
}

/* ===================== CLOUD STORAGE (pluggable — local by default, Firebase optional) ===================== */
// Honesty note: a static HTML file cannot securely hold real database credentials or run
// server logic, so "true" cloud storage needs an actual backend or a client-safe cloud DB.
// Firebase Firestore is the standard no-backend option for prototypes like this one — its
// config is not a secret (access is controlled by Firestore Security Rules on your project),
// so it's safe to use directly from this file once an RM pastes in their own free project's
// config. Until that's done, the toolkit transparently falls back to this browser's local
// storage, so the app keeps working exactly as before.
let CLOUD = { provider:"local", firebaseConfig:null, connected:false, db:null, syncing:false, lastSync:null };

async function connectFirebase(configObj){
  try{
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const fbApp = appMod.initializeApp(configObj);
    CLOUD.db = fsMod.getFirestore(fbApp);
    CLOUD._fs = fsMod;
    CLOUD.provider = "firebase";
    CLOUD.firebaseConfig = configObj;
    CLOUD.connected = true;
    // Deliberately does NOT push here — connecting must never silently overwrite
    // whatever's already in the project. Callers decide pull-vs-push (see
    // submitFirebaseConfig and loadData below).
    return true;
  }catch(err){
    console.error("Firebase connection failed:", err);
    CLOUD.connected = false;
    return false;
  }
}
async function cloudPush(){
  if(CLOUD.provider!=="firebase" || !CLOUD.connected) return false;
  try{
    CLOUD.syncing = true;
    const { doc, setDoc } = CLOUD._fs;
    await setDoc(doc(CLOUD.db, "msmeToolkit", "applications"), { data: JSON.stringify(applications), nextAppSeq, updatedAt: new Date().toISOString() });
    CLOUD.lastSync = new Date().toISOString();
    return true;
  }catch(err){ console.error("Cloud push failed:", err); return false; }
  finally{ CLOUD.syncing = false; }
}
async function cloudPull(){
  if(CLOUD.provider!=="firebase" || !CLOUD.connected) return false;
  try{
    const { doc, getDoc } = CLOUD._fs;
    const snap = await getDoc(doc(CLOUD.db, "msmeToolkit", "applications"));
    if(snap.exists()){
      const d = snap.data();
      applications = JSON.parse(d.data);
      if(d.nextAppSeq) nextAppSeq = d.nextAppSeq;
      return true;
    }
  }catch(err){ console.error("Cloud pull failed:", err); }
  return false;
}
function disconnectCloud(){ CLOUD = { provider:"local", firebaseConfig:null, connected:false, db:null, syncing:false, lastSync:null }; saveData(); render(); }

let nextAppSeq = 1006;

/* ===================== LOCAL PERSISTENCE (fallback "data saving option") ===================== */
const STORAGE_KEY = "msmeOriginationToolkit.v1";
function saveData(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ applications, nextAppSeq, UI, AUTH, cloudProvider:CLOUD.provider, firebaseConfig:CLOUD.firebaseConfig }));
  }catch(err){ /* storage unavailable — fail silently in this prototype */ }
  if(CLOUD.provider==="firebase" && CLOUD.connected){ cloudPush(); }
}
function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const saved = JSON.parse(raw);
    if(saved.applications && saved.applications.length){ applications = saved.applications; }
    if(saved.nextAppSeq) nextAppSeq = saved.nextAppSeq;
    if(saved.UI) UI = Object.assign(UI, saved.UI);
    if(saved.AUTH) AUTH = Object.assign(AUTH, saved.AUTH);
    if(saved.cloudProvider==="firebase" && saved.firebaseConfig){
      connectFirebase(saved.firebaseConfig).then(async ()=>{
        // Safety: never let reconnecting on page load silently overwrite this
        // browser's local data with a smaller (or empty) remote copy. Only
        // adopt remote data if it has at least as much as we already have
        // locally; otherwise treat local as the source of truth and push it
        // up instead. This is exactly the scenario that caused real data
        // loss before this fix — a stale/empty cloud doc auto-overwriting a
        // browser that actually had the real data.
        const remoteCount = await peekCloud();
        if(remoteCount === null){ render(); return; }
        if(remoteCount >= applications.length){
          await cloudPull();
        } else if(applications.length > 0){
          await cloudPush();
        }
        render();
      });
    }
    return true;
  }catch(err){ return false; }
}
function resetDemoData(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(err){}
  location.reload();
}

/* ===================== TEST DUMMY DATA GENERATOR (~60 applications) ===================== */
// Lives here (not dummy-data.js) because it needs calcEMI/estimateFinancials,
// which are only available once calculations.js and this file have loaded.
const SAMPLE_BUSINESS_NAMES = [
  "Sharma Auto Parts","Gupta Traders","Verma Garments","Singh Enterprises","Raj Furniture Works",
  "Om Sai Textiles","Patel Agro Foods","Mehta Electricals","Iyer Precision Tools","Reddy Pharma Distributors",
  "Kumar Plastics","Bose Engineering Works","Khan Leather Goods","Joshi Dairy Products","Nair Spices Co.",
  "Chopra Packaging Solutions","Desai Chemicals","Rao Steel Fabricators","Malhotra Print & Pack","Yadav Cold Storage",
  "Kapoor Hosiery Mills","Pillai Marine Exports","Agarwal Paper Mills","Bhat Software Services","Sinha Auto Ancillaries",
  "Menon Handicrafts","Chandra Bakery & Confectionery","Trivedi Agro Machinery","Saxena Furniture Exports","Pandey Rice Mill",
  "Ghosh Jute Products","Kulkarni Auto Garage","Nayar Fashion Exports","Rathi Cement Products","Bajaj Rubber Industries",
  "Shetty Seafood Exports","Dutta Tea Traders","Mishra Solar Solutions","Kaur Organic Farms","Choudhary Timber Mart",
  "Ahluwalia Cold Chain Logistics","Varma Metal Works","Nambiar Coir Products","Bhatia Sanitaryware","Sengupta IT Services",
  "Rana Motor Spares","Thakur Construction Materials","Divekar Textile Mills","Phadke Ayurvedic Products","Oberoi Interiors",
  "Krishnan Coffee Traders","Basu Electronics Repair","Sarkar Poultry Farms","Bedi Fitness Equipment","Mathur Book Publishers",
  "Chowdhury Handloom Weavers","Bakshi Packaging Films","Narang Auto Detailing","Vora Diamond Cutting","Anand Water Purifiers"
];
const SAMPLE_INDUSTRIES = ["Automobile Components","Textiles & Garments","Food Processing","Electricals & Electronics","Pharma & Healthcare",
  "Plastics & Packaging","Engineering & Fabrication","Leather & Footwear","Dairy & Agro Products","Chemicals",
  "Steel & Metal Works","Printing & Publishing","IT & Software Services","Handicrafts & Exports","Construction Materials",
  "Logistics & Cold Chain","Retail & Trading","Furniture & Interiors"];
const SAMPLE_CITIES = ["Pune, Maharashtra","Ahmedabad, Gujarat","Ludhiana, Punjab","Coimbatore, Tamil Nadu","Jaipur, Rajasthan",
  "Indore, Madhya Pradesh","Surat, Gujarat","Kanpur, Uttar Pradesh","Nashik, Maharashtra","Rajkot, Gujarat",
  "Kolkata, West Bengal","Hyderabad, Telangana","Bengaluru, Karnataka","Chennai, Tamil Nadu","Delhi NCR",
  "Bhopal, Madhya Pradesh","Vadodara, Gujarat","Visakhapatnam, Andhra Pradesh","Kochi, Kerala","Guwahati, Assam"];
const SAMPLE_OWNER_FIRST = ["Ramesh","Suresh","Anita","Priya","Vikram","Deepak","Sunita","Manoj","Kavita","Arjun","Neha","Rahul","Pooja","Sanjay","Meena","Ajay","Ritu","Ashok","Geeta","Vijay"];
const SAMPLE_OWNER_LAST = ["Sharma","Gupta","Verma","Singh","Patel","Reddy","Iyer","Bose","Khan","Joshi","Nair","Desai","Rao","Kapoor","Agarwal","Menon","Saxena","Kulkarni","Varma","Chowdhury"];

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }

function generateTestApplications(count){
  const purposes = Object.keys(PURPOSE_DEFAULT_TENURE);
  const loanTypes = ["Secured","Unsecured"];
  const rateTypes = ["Floating","Fixed"];
  const subsidies = Object.keys(SUBSIDY_SCHEMES);
  const bizTypes = ["Proprietorship","Partnership","LLP","Private Limited"];
  const stageWeights = ["New","New","Documents Pending","Documents Pending","Documents Verified",
    "Financial Analysis","Credit Assessment","Credit Assessment","Recommended","Approved","Approved","Rejected","Disbursed"];

  const usedNames = new Set();
  const out = [];
  for(let i=0;i<count;i++){
    let name = pick(SAMPLE_BUSINESS_NAMES);
    let n=0;
    while(usedNames.has(name) && n<10){ name = pick(SAMPLE_BUSINESS_NAMES); n++; }
    usedNames.add(name);

    // Wide spread across Micro/Small/Medium so classification, caps and
    // segment logic are all exercised during testing.
    const bandRoll = Math.random();
    let loanAmount;
    if(bandRoll<0.55) loanAmount = randInt(2,45)*100000;            // ₹2L–₹45L (Micro-ish)
    else if(bandRoll<0.88) loanAmount = randInt(50,450)*100000;     // ₹50L–₹4.5Cr (Small-ish)
    else loanAmount = randInt(5,25)*10000000;                       // ₹5Cr–₹25Cr (Medium-ish)

    const tenure = pick([1,2,3,4,5,6,7,8,10]);
    const udyamReg = Math.random()<0.82;
    const gstReg = Math.random()<0.88;
    const stage = (udyamReg && gstReg) ? pick(stageWeights) : "Registration Pending";
    const fin = estimateFinancials(loanAmount, tenure);
    const investment = Math.round(fin.curRevenue * (0.15 + Math.random()*0.35));
    const daysAgo = randInt(0,150);
    const date = new Date(Date.now() - daysAgo*86400000).toISOString().slice(0,10);
    const ownerFirst = pick(SAMPLE_OWNER_FIRST), ownerLast = pick(SAMPLE_OWNER_LAST);

    const docs = {};
    DOC_LIST.forEach(d=>{
      if(stage==="Registration Pending") docs[d.key] = "Pending";
      else if(stage==="New") docs[d.key] = pick(["Pending","Pending","Uploaded"]);
      else if(stage==="Documents Pending") docs[d.key] = pick(["Pending","Uploaded","Under Verification"]);
      else docs[d.key] = pick(["Uploaded","Under Verification","Verified","Verified"]);
    });

    out.push({
      id: "MSME-"+(1001+i),
      businessName: name + (Math.random()<0.15 ? " (Demo)" : ""),
      businessType: pick(bizTypes),
      industry: pick(SAMPLE_INDUSTRIES),
      location: pick(SAMPLE_CITIES),
      yearsInBusiness: randInt(1,22),
      employees: randInt(2,260),
      udyam: udyamReg ? "Registered" : "Not Registered",
      udyamId: udyamReg ? "UDYAM-"+pick(["MH","GJ","PB","TN","RJ","MP","UP","KA","WB","KL"])+"-0"+randInt(1,9)+"-00"+randInt(1000,9999) : "",
      investmentPlantMachinery: investment,
      gst: gstReg ? "Registered" : "Not Registered",
      owner:{ name: ownerFirst+" "+ownerLast, age: randInt(28,62), experience: randInt(2,30), managementYears: randInt(1,20) },
      loan:{ amount: loanAmount, purpose: pick(purposes), tenure },
      loanType: pick(loanTypes), interestRateType: pick(rateTypes), subsidyScheme: Math.random()<0.35 ? pick(subsidies.filter(s=>s!=="None")) : "None",
      notes: Math.random()<0.2 ? "Sample/test record generated for demo purposes." : "",
      fin,
      creditInputs:{ creditHistory: randInt(5,25), bankingBehaviour: randInt(3,15) },
      documents: docs,
      stage,
      rm: RM.name,
      rmBranch: RM.branch,
      date,
      decision: stage==="Approved" ? "Recommended for Approval" : (stage==="Rejected" ? "Application Rejected" : null)
    });
  }
  return out;
}

let applications = generateTestApplications(60);
nextAppSeq = 1061;

let UI = {
  view:"dashboard",
  appId:null,
  search:"",
  trackerFilters:{status:"All", risk:"All", industry:"All"},
  eligOverride:{},   // per app id: {amount, rate, tenure}
  sidebarOpen:false, // mobile nav drawer state
  profileMenuOpen:false // account/logout dropdown state
};

/* ===================== CALCULATION ENGINE ===================== */

function getApp(id){ return applications.find(a=>a.id===id); }

function render(){
  saveData();
  const root = document.getElementById("root");
  if(!AUTH.loggedIn){ root.innerHTML = loginHTML(); return; }
  root.innerHTML = sidebarHTML() + '<div class="sidebar-overlay'+(UI.sidebarOpen?" show":"")+'" onclick="closeSidebar()"></div>' + mainHTML();
}
function toggleSidebar(){ UI.sidebarOpen = !UI.sidebarOpen; render(); }
function closeSidebar(){ UI.sidebarOpen = false; render(); }

function visibleApps(){
  if(AUTH.role==="customer") return applications.filter(a=>a.id===AUTH.customerAppId);
  return applications;
}

function sidebarHTML(){
  const roleItems = NAV_ITEMS.filter(it=> it.roles.indexOf(AUTH.role)!==-1 );
  const items = roleItems.map(it=>{
    const active = UI.view===it.view ? " active":"";
    return '<div class="nav-item'+active+'" onclick="navigate(\''+it.view+'\')"><span class="ico">'+it.ico+'</span><span>'+it.label+'</span></div>';
  }).join("");
  const subLabel = AUTH.role==="customer" ? "CUSTOMER PORTAL &middot; PROTOTYPE" : "RM WORKSTATION &middot; PROTOTYPE";
  return '<div class="sidebar'+(UI.sidebarOpen?" open":"")+'">' +
    '<div class="sidebar-brand"><div class="mark"><div class="mark-icon">MO</div><div><div class="mark-text">MSME Origination<br>Toolkit</div></div></div><div class="mark-sub">'+subLabel+'</div></div>' +
    '<div class="sidebar-nav">'+
      '<div class="nav-section-label">Workflow</div>'+
      items + 
    '</div>'+
    '<div class="sidebar-foot">Academic prototype for Microfinance &amp; Banking coursework. All figures are illustrative dummy data.<br>'+
      '<span style="cursor:pointer;color:#8FA6C4;text-decoration:underline;" onclick="logout()">Log out</span>'+
      (AUTH.role==="rm" ? ' &middot; <span style="cursor:pointer;color:#8FA6C4;text-decoration:underline;" onclick="if(confirm(\'Reset all demo data back to the original sample applications? This clears anything saved in this browser.\'))resetDemoData();">Reset demo data</span>' : '')+
    '</div>'+
  '</div>';
}

/* ===================== LOGIN (prototype only — no real authentication) ===================== */
function loginHTML(){
  const tab = UI.loginTab || "rm";
  const custOptions = applications.map(a=>'<option value="'+a.id+'">'+a.businessName+' ('+a.id+')</option>').join("");
  return '<div style="min-height:100vh;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:linear-gradient(120deg,var(--navy-950),var(--navy-800) 60%,var(--teal-600) 140%);padding:20px;">'+
    '<div class="card" style="width:380px;max-width:100%;">'+
      '<div style="text-align:center;margin-bottom:14px;"><div class="mark-icon" style="margin:0 auto 10px auto;">MO</div>'+
      '<div style="font-family:var(--font-display);font-weight:800;font-size:16px;color:var(--navy-950);">MSME Origination Toolkit</div>'+
      '<div style="font-size:11.5px;color:var(--text-muted);">Academic prototype login &middot; no real credentials are checked</div></div>'+
      '<div class="tabbar" style="margin-bottom:16px;">'+
        '<button type="button" class="tab-btn'+(tab==="rm"?" active":"")+'" onclick="setLoginTab(\'rm\')">RM Login</button>'+
        '<button type="button" class="tab-btn'+(tab==="customer"?" active":"")+'" onclick="setLoginTab(\'customer\')">Customer Login</button>'+
      '</div>'+
      (tab==="rm" ?
        '<form onsubmit="doLogin(event,\'rm\')">'+
          '<div class="field" style="margin-bottom:12px;"><label>Username</label><input id="loginUser" type="text" placeholder="rm.priya" required/></div>'+
          '<div class="field" style="margin-bottom:16px;"><label>Password</label><input id="loginPass" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" required/></div>'+
          '<button type="submit" class="btn btn-primary btn-block">Log in as Relationship Manager &rarr;</button>'+
        '</form>'
      :
        '<form onsubmit="doLogin(event,\'customer\')">'+
          (applications.length===0 ? '<div class="callout callout-warn">No applications exist yet. Ask your RM to originate one first.</div>' :
          '<div class="field" style="margin-bottom:12px;"><label>Your Business (demo selector)</label><select id="loginAppId">'+custOptions+'</select></div>'+
          '<div class="field" style="margin-bottom:12px;"><label>Username</label><input id="loginUser" type="text" placeholder="e.g. your mobile number" required/></div>'+
          '<div class="field" style="margin-bottom:16px;"><label>Password</label><input id="loginPass" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" required/></div>'+
          '<button type="submit" class="btn btn-primary btn-block">Log in as Customer &rarr;</button>')+
        '</form>'
      )+
      '<div class="callout callout-disclaimer" style="margin-top:16px;">This is a simulated login for prototype purposes. Any username/password is accepted and no data is transmitted.</div>'+
    '</div>'+
  '</div>';
}
function setLoginTab(tab){ UI.loginTab = tab; render(); }
function doLogin(e, role){
  e.preventDefault();
  const f = e.target;
  const username = f.querySelector("#loginUser").value || (role==="rm" ? RM.name : "Customer");
  AUTH.loggedIn = true;
  AUTH.role = role;
  AUTH.username = username;
  if(role==="customer"){
    const sel = f.querySelector("#loginAppId");
    AUTH.customerAppId = sel ? sel.value : (applications[0] && applications[0].id);
    UI.appId = AUTH.customerAppId;
    UI.view = "profile";
  } else {
    AUTH.customerAppId = null;
    UI.view = "dashboard";
  }
  render();
}
function logout(){ AUTH = { loggedIn:false, role:null, username:null, customerAppId:null }; UI.view="dashboard"; UI.profileMenuOpen=false; render(); }

function topbarHTML(){
  const custName = AUTH.role==="customer" ? (getApp(AUTH.customerAppId)?getApp(AUTH.customerAppId).businessName:"Customer") : null;
  const chipName = AUTH.role==="customer" ? custName : RM.name;
  const chipRole = AUTH.role==="customer" ? "Customer Portal" : RM.branch;
  const chipInitials = AUTH.role==="customer" ? (AUTH.username||"C").slice(0,2).toUpperCase() : RM.initials;
  const menu = UI.profileMenuOpen ?
    '<div class="profile-menu" onclick="event.stopPropagation()">'+
      '<div class="profile-menu-head"><div class="rm-avatar">'+chipInitials+'</div><div><div class="rm-name">'+chipName+'</div><div class="rm-role">'+chipRole+'</div></div></div>'+
      '<div class="profile-menu-sep"></div>'+
      '<button class="profile-menu-item" onclick="logout()">&#128682; Log out</button>'+
    '</div>' : '';
  return '<div class="topbar">'+
    '<button class="menu-toggle" onclick="toggleSidebar()" aria-label="Open menu">&#9776;</button>'+
    '<div class="search-wrap"><span class="sico">&#128269;</span><input id="globalSearch" placeholder="Search business, application ID, industry, owner..." value="'+escapeHtml(UI.search)+'" oninput="onGlobalSearch(this.value)"/></div>'+
    '<div class="topbar-right">'+
      '<div class="bell">&#128276;<span class="dot"></span></div>'+
      '<div class="profile-menu-wrap">'+
        '<div class="rm-chip" onclick="toggleProfileMenu()" title="Account"><div class="rm-avatar">'+chipInitials+'</div><div><div class="rm-name">'+chipName+'</div><div class="rm-role">'+chipRole+'</div></div></div>'+
        menu+
      '</div>'+
    '</div>'+
  (UI.profileMenuOpen ? '<div class="profile-menu-overlay" onclick="closeProfileMenu()"></div>' : '')+
  '</div>';
}
function toggleProfileMenu(){ UI.profileMenuOpen = !UI.profileMenuOpen; render(); }
function closeProfileMenu(){ UI.profileMenuOpen = false; render(); }

function mainHTML(){
  return '<div class="main">'+ topbarHTML() + '<div class="content">' + viewHTML() + '</div></div>';
}

function viewHTML(){
  const navMeta = NAV_ITEMS.find(n=>n.view===UI.view);
  if(navMeta && navMeta.needsApp && !UI.appId){
    return appPickerHTML(navMeta.label);
  }
  switch(UI.view){
    case "dashboard": return dashboardHTML();
    case "newapp": return newAppHTML();
    case "profile": return profileHTML();
    case "documents": return documentsHTML();
    case "financials": return financialsHTML();
    case "credit": return creditHTML();
    case "eligibility": return eligibilityHTML();
    case "aiinsights": return aiInsightsHTML();
    case "recommendation": return recommendationHTML();
    case "decision": return decisionHTML();
    case "tracking": return trackingHTML();
    case "cloudsettings": return cloudSettingsHTML();
    default: return dashboardHTML();
  }
}

function appPickerHTML(label){
  const rows = visibleApps().map(a=> '<div class="app-picker-item" onclick="selectApp(\''+a.id+'\',\''+UI.view+'\')">'+
      '<div><div class="tbl-name">'+a.businessName+'</div><div class="tbl-sub">'+a.id+' &middot; '+a.industry+' &middot; '+fmtINR(a.loan.amount)+' requested</div></div>'+
      stageBadge(a.stage) +
    '</div>').join("");
  return pageHead("Select an Application", "Choose which MSME application to open in "+label) +
    '<div class="card"><div class="section-title">Open Application</div><div class="section-sub">'+label+' needs an application in context. Pick one below, or start a new one.</div>'+
    rows +
    (AUTH.role==="rm" ? '<button class="btn btn-outline btn-block" style="margin-top:6px;" onclick="navigate(\'newapp\')">+ Start New MSME Application</button>' : '')+
    '</div>';
}

function pageHead(title, sub, crumb){
  return '<div class="page-head"><div>'+(crumb?'<div class="crumb">'+crumb+'</div>':'')+'<h1>'+title+'</h1><div class="sub">'+sub+'</div></div></div>';
}

function escapeHtml(s){ if(s===undefined||s===null) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function stageBadge(stage){
  const cls = {
    "New":"badge-New","Documents Pending":"badge-Pending","Documents Verified":"badge-Verified",
    "Financial Analysis":"badge-neutral","Credit Assessment":"badge-neutral","Recommended":"badge-Recommended",
    "Approved":"badge-Approved","Rejected":"badge-Rejected","Disbursed":"badge-Disbursed"
  }[stage] || "badge-neutral";
  return '<span class="badge '+cls+'">'+stage+'</span>';
}

/* ===================== DISCLAIMER FOOTER ===================== */
function disclaimerHTML(){
  return '<div class="footer-disclaimer">&#9888;&#65039; <strong>Prototype for academic demonstration.</strong> Credit scores, eligibility amounts, interest rates, risk ratings and recommendations shown in this toolkit are illustrative and computed from sample data only. They should not be used for actual lending decisions and do not reflect any real bank\'s underwriting policy.</div>';
}

/* ===================== DASHBOARD ===================== */
function filteredForSearch(list){
  if(!UI.search.trim()) return list;
  const q = UI.search.trim().toLowerCase();
  return list.filter(a => a.businessName.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.industry.toLowerCase().includes(q) || a.owner.name.toLowerCase().includes(q));
}

function dashboardHTML(){
  const list = filteredForSearch(applications);
  const total = applications.length;
  const underReview = applications.filter(a=>["Documents Pending","Documents Verified","Financial Analysis","Credit Assessment"].includes(a.stage)).length;
  const approved = applications.filter(a=>["Approved","Disbursed"].includes(a.stage)).length;
  const pendingDocs = applications.filter(a=>docCompletion(a)<100).length;
  const totalRequested = applications.reduce((s,a)=>s+a.loan.amount,0);
  const totalEligible = applications.reduce((s,a)=>s+calcEligibility(a).eligible,0);

  const statusCounts = {};
  STAGES.forEach(s=>statusCounts[s]=0);
  applications.forEach(a=>statusCounts[a.stage]++);
  const maxStatus = Math.max(1,...Object.values(statusCounts));

  const riskCounts = {"Low Risk":0,"Moderate Risk":0,"High Risk":0};
  applications.forEach(a=>{ riskCounts[calcCreditScore(a).risk]++; });
  const riskTotal = applications.length || 1;

  const statusRows = Object.keys(statusCounts).filter(s=>statusCounts[s]>0 || ["New","Documents Pending","Credit Assessment","Recommended","Approved","Rejected"].includes(s)).map(s=>{
    const w = Math.round((statusCounts[s]/maxStatus)*100);
    return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:11.8px;margin-bottom:4px;"><span>'+s+'</span><span class="mono" style="font-weight:700;">'+statusCounts[s]+'</span></div><div class="meter-track"><div class="meter-fill" style="width:'+w+'%;"></div></div></div>';
  }).join("");

  const riskColors = {"Low Risk":"#1C7F51","Moderate Risk":"#B4720A","High Risk":"#B93B3B"};
  let cumulative = 0;
  const gradientParts = Object.keys(riskCounts).map(k=>{
    const pct = riskCounts[k]/riskTotal*100;
    const part = riskColors[k]+" "+cumulative+"% "+(cumulative+pct)+"%";
    cumulative += pct;
    return part;
  }).join(", ");
  const riskLegend = Object.keys(riskCounts).map(k=> '<div class="dot-legend"><span class="sw" style="background:'+riskColors[k]+';"></span>'+k.replace(" Risk","")+' &middot; '+riskCounts[k]+'</div>').join("");

  const tableRows = list.map(a=>{
    const cs = calcCreditScore(a);
    return '<tr>'+
      '<td class="mono">'+a.id+'</td>'+
      '<td><div class="tbl-name">'+a.businessName+'</div><div class="tbl-sub">'+a.owner.name+'</div></td>'+
      '<td>'+a.industry+'</td>'+
      '<td class="mono">'+fmtINR(a.loan.amount)+'</td>'+
      '<td><span class="badge '+riskBadgeClass(cs.risk)+'">'+riskWord(cs.risk)+'</span></td>'+
      '<td class="mono">'+fmtNum(cs.total,0)+'/100</td>'+
      '<td>'+stageBadge(a.stage)+'</td>'+
      '<td class="tbl-sub">'+a.date+'</td>'+
      '<td><button class="btn btn-ghost btn-sm" onclick="selectApp(\''+a.id+'\',\'profile\')">View</button>'+
          '<button class="btn btn-ghost btn-sm" onclick="selectApp(\''+a.id+'\',\'tracking\')">Track</button></td>'+
    '</tr>';
  }).join("");

  return pageHead("Dashboard", "Portfolio overview of the MSME loan origination pipeline") +
  '<div class="hero-intro"><h2>MSME Origination Toolkit</h2><p>An integrated digital assistant for faster and smarter MSME loan origination &mdash; bringing customer intake, document collection, financial analysis, credit assessment and recommendations onto a single screen for the Relationship Manager.</p>'+
  '<div class="hero-vals">'+
    '<div class="hv"><div class="n">01</div><div class="t">Faster Origination</div><div class="d">Reduce manual data collection and repeated calculations across spreadsheets.</div></div>'+
    '<div class="hv"><div class="n">02</div><div class="t">Better Assessment</div><div class="d">Combine financial, credit and business information into one consolidated view.</div></div>'+
    '<div class="hv"><div class="n">03</div><div class="t">Smarter Recommendations</div><div class="d">Help RMs identify suitable loan products and the right next action.</div></div>'+
  '</div></div>'+

  '<div class="grid grid-4" style="margin-bottom:16px;">'+
    kpiCard("Total Applications", total, "&#128193;", "#EAF0FA", "var(--navy-700)", "Across all stages")+
    kpiCard("Under Review", underReview, "&#8987;", "var(--amber-100)", "var(--amber-600)", "Docs / financial / credit stage")+
    kpiCard("Approved", approved, "&#9989;", "var(--green-100)", "var(--green-600)", "Approved or disbursed")+
    kpiCard("Pending Documents", pendingDocs, "&#128204;", "var(--red-100)", "var(--red-600)", "Applications with incomplete docs")+
  '</div>'+
  '<div class="grid grid-2" style="margin-bottom:16px;">'+
    kpiCard("Total Loan Amount Requested", fmtINR(totalRequested), "&#128176;", "var(--teal-100)", "var(--teal-600)", "Sum of all requested amounts")+
    kpiCard("Total Eligible Loan Amount", fmtINR(totalEligible), "&#128181;", "var(--teal-100)", "var(--teal-600)", "Indicative, computed prototype estimate")+
  '</div>'+

  '<div class="two-col" style="margin-bottom:16px;">'+
    '<div class="card"><div class="section-title">Application Status Pipeline</div><div class="section-sub">Number of applications currently at each stage</div>'+statusRows+'</div>'+
    '<div class="card"><div class="section-title">Risk Distribution</div><div class="section-sub">Prototype credit risk categorisation</div>'+
      '<div style="width:150px;height:150px;border-radius:50%;margin:6px auto 16px auto;background:conic-gradient('+gradientParts+');"></div>'+
      '<div style="display:flex;flex-direction:column;gap:8px;">'+riskLegend+'</div>'+
    '</div>'+
  '</div>'+

  '<div class="card">'+
    '<div class="card-row"><div><div class="section-title">Recent Applications</div><div class="section-sub" style="margin-bottom:0;">Live pipeline of MSME applications in the system</div></div>'+
    '<button class="btn btn-primary" onclick="navigate(\'newapp\')">+ New MSME Application</button></div>'+
    '<div style="overflow-x:auto;"><table><thead><tr><th>App ID</th><th>Business</th><th>Industry</th><th>Loan Requested</th><th>Risk</th><th>Credit Score</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>'+
    (tableRows || '<tr><td colspan="9" style="text-align:center;color:var(--text-faint);padding:24px;">No applications match your search.</td></tr>')+
    '</tbody></table></div>'+
  '</div>'+
  disclaimerHTML();
}

function kpiCard(label, value, ico, bg, fg, foot){
  return '<div class="card kpi-card"><div class="kpi-top"><div class="kpi-label">'+label+'</div><div class="kpi-icon" style="background:'+bg+';color:'+fg+';">'+ico+'</div></div><div class="kpi-value">'+value+'</div><div class="kpi-foot">'+foot+'</div></div>';
}

/* ===================== NEW MSME APPLICATION ===================== */
function newAppHTML(){
  return pageHead("New MSME Application", "Capture business, owner and loan requirement details to originate a new application") +
  '<div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:14px;background:var(--bg);">'+
    '<div class="rm-avatar" style="width:44px;height:44px;font-size:15px;">'+RM.initials+'</div>'+
    '<div>'+
      '<div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;">Originating Relationship Manager (pre-filled)</div>'+
      '<div style="font-family:var(--font-display);font-weight:700;font-size:14.5px;color:var(--navy-950);margin-top:2px;">'+RM.name+' &middot; '+RM.employeeId+'</div>'+
      '<div style="font-size:11.5px;color:var(--text-muted);">'+RM.role+' &middot; '+RM.branch+' &middot; '+new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+'</div>'+
    '</div>'+
  '</div>'+
  '<form class="card" onsubmit="submitNewApp(event)">'+

  '<div class="fieldset-title"><span class="step-num">A</span> Basic Business Details</div>'+
  '<div class="form-grid">'+
    field("Business Name","bizName","text","e.g. Om Sai Textiles",true)+
    selectField("Business Type","bizType",["Proprietorship","Partnership","LLP","Private Limited"])+
    field("Industry","industry","text","e.g. Manufacturing, Trading, Services",true)+
    field("Business Location","location","text","City, State",true)+
    field("Years in Business","years","number","e.g. 6",true)+
    field("Number of Employees","employees","number","e.g. 15",true)+
    selectField("Udyam Registration Status","udyam",["Registered","Not Registered"])+
    field("Udyam Registration Number","udyamId","text","e.g. UDYAM-MH-03-0012345",false)+
    selectField("GST Registration Status","gst",["Registered","Not Registered"])+
    field("Investment in Plant &amp; Machinery/Equipment (&#8377;)","investment","number","e.g. 6500000",true)+
  '</div>'+
  '<div class="callout callout-warn" style="margin-top:2px;">&#128204; MSME lending requires <strong>Udyam registration</strong> (and typically GST) before a loan can be formally processed. If the business isn\'t registered yet, you can still open a file here, but it will be parked as "Registration Pending" until the customer completes registration at <span class="mono">udyamregistration.gov.in</span>.</div>'+
  '<div class="callout callout-info" id="msmeTypePreview" style="margin-top:10px;">&#8505;&#65039; MSME category (Micro/Small/Medium) is auto-classified from investment and turnover per Udyam norms once the application is created.</div>'+

  '<div class="fieldset-title"><span class="step-num">B</span> Owner Details</div>'+
  '<div class="form-grid">'+
    field("Owner / Promoter Name","ownerName","text","Full name",true)+
    field("Age","ownerAge","number","e.g. 42",true)+
    field("Experience in Business (years)","ownerExp","number","e.g. 12",true)+
    field("Years of Management Experience","ownerMgmt","number","e.g. 8",true)+
  '</div>'+

  '<div class="fieldset-title"><span class="step-num">C</span> Loan Requirement</div>'+
  '<div class="form-grid">'+
    field("Loan Amount Requested (&#8377;)","loanAmount","number","e.g. 1500000",true)+
    selectField("Purpose of Loan","purpose",["Working Capital","Machinery Purchase","Business Expansion","Inventory Purchase","Commercial Vehicle","Other"])+
    field("Preferred Tenure (years)","tenure","number","e.g. 5",true)+
    selectField("Loan Type","loanType",["Secured","Unsecured"])+
    selectField("Interest Rate Type","interestRateType",["Floating","Fixed"])+
    selectField("Subsidy Scheme (if applicable)","subsidyScheme",Object.keys(SUBSIDY_SCHEMES))+
  '</div>'+

  '<div class="fieldset-title"><span class="step-num">D</span> Additional Information</div>'+
  '<div class="form-grid">'+
    '<div class="field field-span2"><label>Notes / Additional Data</label><textarea id="notes" name="notes" rows="3" placeholder="Any other context about the business, collateral, or special requirement..."></textarea></div>'+
  '</div>'+

  '<div class="callout callout-info" style="margin-top:18px;">&#8505;&#65039; After creating the application, sample/illustrative financial figures will be pre-filled based on the loan amount so you can immediately explore Financial Analysis, Credit Assessment and Loan Eligibility. These can be edited at any time. The MSME category and the applicable indicative loan cap are auto-computed from your Investment and Turnover figures.</div>'+

  '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">'+
    '<button type="button" class="btn btn-outline" onclick="navigate(\'dashboard\')">Cancel</button>'+
    '<button type="submit" class="btn btn-primary">Create Application &rarr;</button>'+
  '</div>'+
  '</form>';
}

function field(label, id, type, placeholder, required){
  return '<div class="field"><label>'+label+(required?' *':'')+'</label><input id="'+id+'" name="'+id+'" type="'+type+'" placeholder="'+(placeholder||"")+'" '+(required?"required":"")+'/></div>';
}
function selectField(label, id, options){
  const opts = options.map(o=>'<option value="'+o+'">'+o+'</option>').join("");
  return '<div class="field"><label>'+label+'</label><select id="'+id+'" name="'+id+'">'+opts+'</select></div>';
}

function estimateFinancials(loanAmount, tenure){
  // Randomised-but-plausible financial estimate, kept sensitive to the actual
  // loan amount (via EMI-driven debt obligation) so bigger requests relative
  // to the business's cash flow genuinely show up as tighter ratios instead
  // of every application scoring identically regardless of amount.
  const rnd = (min,max)=> min + Math.random()*(max-min);

  const turnoverMultiple = rnd(3, 6.5);                 // how large the business is vs. the loan ask
  const turnover = loanAmount * turnoverMultiple;
  const growthPct = rnd(-6, 20);                        // YoY revenue growth, can be negative
  const prevTurnover = turnover / (1 + growthPct/100);

  const profitMarginPct = rnd(2.5, 15);
  const profit = turnover * (profitMarginPct/100);
  const prevProfitMarginPct = clamp(profitMarginPct + rnd(-2.5,2.5), 1, 18);
  const prevProfit = prevTurnover * (prevProfitMarginPct/100);

  const currentLiabilities = turnover * rnd(0.12, 0.24);
  const currentRatioTarget = rnd(0.85, 1.9);
  const currentAssets = currentLiabilities * currentRatioTarget;

  const equity = turnover * rnd(0.18, 0.35);
  const debtEquityTarget = rnd(0.4, 2.3);
  const existingDebt = equity * debtEquityTarget;

  // Debt obligation ties directly to the actual loan being requested (an
  // approximate EMI at a placeholder rate) plus a smaller obligation from
  // existing debt — so a large ask against a small business genuinely
  // stresses DSCR instead of always looking "Excellent".
  const placeholderRate = 12;
  const loanEMI = calcEMI(loanAmount, placeholderRate, tenure||5);
  const existingDebtEMI = calcEMI(existingDebt, 11, 4);
  const annualDebtObligation = (loanEMI + existingDebtEMI) * 12;
  const cashFlow = profit * rnd(0.65, 0.95); // rough cash proxy (profit + non-cash add-backs)

  return {
    curRevenue: Math.round(turnover), prevRevenue: Math.round(prevTurnover),
    curProfit: Math.round(profit), prevProfit: Math.round(prevProfit),
    currentAssets: Math.round(currentAssets), currentLiabilities: Math.round(currentLiabilities),
    totalDebt: Math.round(existingDebt), equity: Math.round(equity),
    annualDebtObligation: Math.round(annualDebtObligation), cashFlow: Math.round(cashFlow)
  };
}

function submitNewApp(e){
  e.preventDefault();
  const f = e.target;
  const val = (id)=> f.querySelector("#"+id).value;
  const loanAmount = parseFloat(val("loanAmount"))||1000000;
  const tenure = parseFloat(val("tenure"))||5;
  const udyamStatus = val("udyam");
  const gstStatus = val("gst");
  if(udyamStatus!=="Registered" || gstStatus!=="Registered"){
    const missing = [udyamStatus!=="Registered"?"Udyam":null, gstStatus!=="Registered"?"GST":null].filter(Boolean).join(" and ");
    const proceed = confirm("This business is not yet registered for: "+missing+".\n\nMSME lending requires Udyam (and typically GST) registration before a loan can be formally processed. You can still create this application to start the file, but it will be flagged as \"Registration Pending\" and should not move past document collection until the customer completes registration.\n\nContinue creating the application?");
    if(!proceed) return;
  }
  const id = "MSME-"+(nextAppSeq++);
  const app = {
    id,
    businessName: val("bizName"),
    businessType: val("bizType"),
    industry: val("industry"),
    location: val("location"),
    yearsInBusiness: parseInt(val("years"))||1,
    employees: parseInt(val("employees"))||1,
    udyam: udyamStatus,
    udyamId: val("udyamId"),
    investmentPlantMachinery: parseFloat(val("investment"))||0,
    gst: gstStatus,
    owner:{ name: val("ownerName"), age: parseInt(val("ownerAge"))||30, experience: parseInt(val("ownerExp"))||1, managementYears: parseInt(val("ownerMgmt"))||1 },
    loan:{ amount: loanAmount, purpose: val("purpose"), tenure: tenure },
    loanType: val("loanType"), interestRateType: val("interestRateType"), subsidyScheme: val("subsidyScheme"), notes: val("notes"),
    fin: estimateFinancials(loanAmount, tenure),
    creditInputs:{ creditHistory: Math.round(8+Math.random()*16), bankingBehaviour: Math.round(5+Math.random()*10) },
    documents: freshDocs({}),
    stage: (udyamStatus!=="Registered" || gstStatus!=="Registered") ? "Registration Pending" : "New",
    rm: RM.name,
    rmBranch: RM.branch,
    date: new Date().toISOString().slice(0,10),
    decision: null
  };
  applications.unshift(app);
  UI.appId = app.id;
  UI.view = "profile";
  saveData();
  render();
  const cap = loanCapCheck(app);
  if(!cap.withinCap){
    showToast("Application "+id+" created — but requested amount exceeds the indicative "+cap.type+" MSME cap of "+fmtINR(cap.cap)+".");
  } else {
    showToast("Application "+id+" created for "+app.businessName+" (classified: "+cap.type+")");
  }
}

/* ===================== CLOUD STORAGE SETTINGS ===================== */
function cloudSettingsHTML(){
  const connected = CLOUD.provider==="firebase" && CLOUD.connected;
  return pageHead("Cloud Storage", "Store application data in a real cloud database instead of just this browser", "Settings") +
  '<div class="callout callout-disclaimer" style="margin-bottom:16px;">A static HTML prototype like this one cannot safely embed real database passwords or run server-side code. '+
    'What it <em>can</em> do is connect to <strong>Firebase Firestore</strong> &mdash; Google\'s free, no-backend cloud database built for exactly this kind of client-side app. '+
    'Its config values aren\'t secret keys; access is controlled by Firestore Security Rules on your own project. Without a connection, application data is saved to this browser\'s local storage only (as before).</div>'+
  '<div class="grid grid-2">'+
    '<div class="card">'+
      '<div class="section-title">Connection Status</div>'+
      statLine("Storage Backend", connected ? '<span class="badge badge-Verified">Firebase Cloud (connected)</span>' : '<span class="badge badge-neutral">Local Browser Storage</span>')+
      statLine("Last Synced", CLOUD.lastSync ? new Date(CLOUD.lastSync).toLocaleString() : "&mdash;")+
      statLine("Applications Stored", applications.length)+
      (connected ? '<button class="btn btn-outline" style="margin-top:12px;" onclick="syncCloudNow()">Sync now (pull latest)</button>' : '')+
      (connected ? '<button class="btn btn-outline" style="margin-top:8px;" onclick="pushLocalToCloudNow()">Push local data to Firebase (overwrite cloud)</button>' : '')+
      (connected ? '<button class="btn btn-outline" style="margin-top:8px;" onclick="disconnectCloud()">Disconnect &amp; revert to local storage</button>' : '')+
    '</div>'+
    '<div class="card">'+
      '<div class="section-title">Connect a Firebase Project</div>'+
      '<div class="section-sub">Paste the config object from your Firebase Console &rarr; Project Settings &rarr; General &rarr; Your apps.</div>'+
      '<textarea id="fbConfigInput" rows="7" style="width:100%;border:1px solid var(--border);border-radius:7px;padding:9px 11px;font-family:var(--font-mono);font-size:11.5px;" placeholder=\'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "storageBucket": "...",\n  "messagingSenderId": "...",\n  "appId": "..."\n}\'></textarea>'+
      '<button class="btn btn-primary" style="margin-top:10px;" onclick="submitFirebaseConfig()">Connect Cloud Storage</button>'+
      '<div class="callout callout-warn" style="margin-top:12px;">&#9888;&#65039; Remember to set Firestore Security Rules on your project so only your RM team can read/write this data &mdash; a default-open project is publicly writable.</div>'+
    '</div>'+
  '</div>'+
  disclaimerHTML();
}
function submitFirebaseConfig(){
  const raw = document.getElementById("fbConfigInput").value.trim();
  if(!raw){ showToast("Paste your Firebase config first."); return; }
  let cfg;
  try{ cfg = JSON.parse(raw); }catch(err){ showToast("That doesn't look like valid JSON — copy the config object exactly as Firebase shows it."); return; }
  const required = ["apiKey","authDomain","projectId","appId"];
  const missing = required.filter(k => !cfg[k]);
  if(missing.length){ showToast("Config is missing: " + missing.join(", ") + ". Copy the full object from Firebase Console \u2192 Project Settings."); return; }
  showToast("Connecting to Firebase...");
  connectFirebase(cfg).then(async ok=>{
    if(!ok){ showToast("Couldn't connect. Check the config values and your network, then try again."); return; }
    // Pull first so connecting never clobbers data another RM already pushed.
    // Only seed the project with this browser's local data if it's genuinely empty.
    const hadRemoteData = await cloudPull();
    if(!hadRemoteData){ await cloudPush(); }
    saveData();
    render();
    showToast(hadRemoteData
      ? "Connected — loaded the existing applications already saved in your Firebase project."
      : "Connected — this project was empty, so this browser's data has been pushed as the starting point.");
  });
}
function syncCloudNow(){
  if(CLOUD.provider!=="firebase" || !CLOUD.connected){ showToast("Connect Firebase first."); return; }
  showToast("Checking Firebase for the latest data...");
  peekCloud().then(remoteCount=>{
    if(remoteCount !== null && remoteCount < applications.length){
      const proceed = confirm(
        "Firebase currently has " + remoteCount + " application(s), but this browser has " + applications.length + ". " +
        "Pulling now will REPLACE this browser's " + applications.length + " application(s) with Firebase's " + remoteCount + ". " +
        "If you're not sure Firebase is up to date, click Cancel and use \"Push local data to Firebase\" instead.\n\nPull anyway?"
      );
      if(!proceed){ showToast("Cancelled — nothing changed."); return; }
    }
    cloudPull().then(found=>{
      render();
      showToast(found ? "Synced — showing the latest data from Firebase." : "No data found in Firebase yet.");
    });
  });
}
async function peekCloud(){
  // Read-only check of how many applications are currently in Firestore,
  // WITHOUT touching local state — used to warn before an overwriting pull.
  if(CLOUD.provider!=="firebase" || !CLOUD.connected) return null;
  try{
    const { doc, getDoc } = CLOUD._fs;
    const snap = await getDoc(doc(CLOUD.db, "msmeToolkit", "applications"));
    if(!snap.exists()) return 0;
    const d = snap.data();
    const arr = JSON.parse(d.data || "[]");
    return Array.isArray(arr) ? arr.length : 0;
  }catch(err){ console.error("Cloud peek failed:", err); return null; }
}
function pushLocalToCloudNow(){
  if(CLOUD.provider!=="firebase" || !CLOUD.connected){ showToast("Connect Firebase first."); return; }
  const proceed = confirm(
    "This will OVERWRITE Firebase with this browser's " + applications.length + " application(s), " +
    "discarding whatever is currently saved in Firebase. Use this to restore/repair cloud data from this browser. Continue?"
  );
  if(!proceed){ showToast("Cancelled — nothing changed."); return; }
  showToast("Pushing this browser's data to Firebase...");
  cloudPush().then(ok=>{
    render();
    showToast(ok ? "Done — Firebase now matches this browser (" + applications.length + " application(s))." : "Push failed — check your network/rules and try again.");
  });
}

/* ===================== CUSTOMER PROFILE ===================== */
function progressStagesFor(app){
  // 6 milestone view distinct from raw pipeline STAGES
  const dc = docCompletion(app);
  const registered = app.udyam==="Registered" && app.gst==="Registered";
  const milestones = [
    {key:"Registration", done: registered, current: !registered},
    {key:"Documents", done: dc===100, current: registered && dc>0 && dc<100},
    {key:"Financial Analysis", done: ["Credit Assessment","Recommended","Approved","Disbursed"].includes(app.stage), current: app.stage==="Financial Analysis"},
    {key:"Credit Assessment", done: ["Recommended","Approved","Disbursed"].includes(app.stage), current: app.stage==="Credit Assessment"},
    {key:"Loan Recommendation", done: ["Approved","Disbursed"].includes(app.stage), current: app.stage==="Recommended"},
    {key:"Final Decision", done: ["Approved","Disbursed"].includes(app.stage), current: app.stage==="Rejected"}
  ];
  return milestones;
}

function railHTML(milestones, labelKey, currentKey){
  return '<div class="rail">' + milestones.map(m=>{
    let cls="rail-node";
    if(m.done) cls+=" done"; else if(m.current) cls+=" current";
    const icon = m.done ? "&#10003;" : (m.current ? "&#8226;" : "");
    return '<div class="'+cls+'"><div class="line"></div><div class="dot">'+icon+'</div><div class="lbl">'+m.key+'</div></div>';
  }).join("") + '</div>';
}

function profileHTML(){
  const app = getApp(UI.appId);
  const r = calcRatios(app.fin);
  const cs = calcCreditScore(app);
  const seg = segmentOf(app);
  const dc = docCompletion(app);
  const milestones = progressStagesFor(app);
  const cap = loanCapCheck(app);
  const rate = indicativeRate(cs.risk, app);

  return pageHead(app.businessName, app.industry+" &middot; "+app.location+" &middot; Application "+app.id, "Customer Profile") +

  '<div class="card" style="margin-bottom:16px;">'+
    '<div class="card-row"><div class="section-title" style="margin-bottom:0;">Application Journey</div>'+stageBadge(app.stage)+'</div>'+
    railHTML(milestones)+
  '</div>'+

  (!cap.withinCap ? '<div class="callout callout-warn" style="margin-bottom:16px;">&#9888;&#65039; Requested amount ('+fmtINR(app.loan.amount)+') exceeds the illustrative loan cap of '+fmtINR(cap.cap)+' for a <strong>'+cap.type+'</strong> enterprise under this prototype\'s Udyam-linked limits.</div>' : '')+
  (app.udyam!=="Registered" || app.gst!=="Registered" ? '<div class="callout callout-warn" style="margin-bottom:16px;">&#128204; This business still needs to complete <strong>'+[app.udyam!=="Registered"?"Udyam":null, app.gst!=="Registered"?"GST":null].filter(Boolean).join(" and ")+' registration</strong> before this application can move past document collection. '+(AUTH.role==="customer" ? 'Please register at <span class="mono">udyamregistration.gov.in</span> and share the registration number with your RM.' : 'Follow up with the customer to complete registration.')+'</div>' : '')+

  '<div class="grid grid-3" style="margin-bottom:16px;">'+
    '<div class="card"><div class="section-title">Business Overview</div>'+
      statLine("Business Type", app.businessType)+
      statLine("MSME Category (Udyam)", '<span class="badge badge-neutral">'+cap.type+'</span>')+
      statLine("Industry", app.industry)+
      statLine("Location", app.location)+
      statLine("Business Vintage", app.yearsInBusiness+" years")+
      statLine("Employees", app.employees)+
      statLine("Annual Turnover", fmtINR(app.fin.curRevenue))+
      statLine("Investment in P&amp;M/Equipment", fmtINR(app.investmentPlantMachinery))+
      statLine("Segment", seg.maturity+" &middot; "+seg.size)+
    '</div>'+
    '<div class="card"><div class="section-title">Loan Requirement</div>'+
      statLine("Requested Amount", fmtINR(app.loan.amount))+
      statLine("Indicative Cap for "+cap.type, cap.cap?fmtINR(cap.cap):"-")+
      statLine("Loan Purpose", app.loan.purpose)+
      statLine("Loan Type", app.loanType||"-")+
      statLine("Interest Rate Type", app.interestRateType||"-")+
      statLine("Indicative Interest Rate", rate+"% p.a.")+
      statLine("Proposed Tenure", app.loan.tenure+" years")+
      statLine("Subsidy Scheme", app.subsidyScheme && app.subsidyScheme!=="None" ? app.subsidyScheme : "Not applicable")+
    '</div>'+
    '<div class="card"><div class="section-title">Credit Snapshot</div>'+
      statLine("Credit Risk Score", fmtNum(cs.total,0)+" / 100")+
      statLine("Risk Category", '<span class="badge '+riskBadgeClass(cs.risk)+'">'+riskWord(cs.risk)+'</span>')+
      statLine("Existing Debt", fmtINR(app.fin.totalDebt))+
      statLine("Repayment Capacity (DSCR)", fmtNum(r.dscr,2)+"x")+
      statLine("Document Completion", dc+"%")+
      statLine("GST Registration", app.gst)+
      statLine("Udyam Registration", app.udyam+(app.udyamId?" ("+app.udyamId+")":""))+
    '</div>'+
  '</div>'+

  (app.notes ? '<div class="card" style="margin-bottom:16px;"><div class="section-title">Additional Notes</div><div style="font-size:12.6px;color:var(--text-muted);">'+escapeHtml(app.notes)+'</div></div>' : '')+

  '<div class="grid grid-2" style="margin-bottom:16px;">'+
    '<div class="card"><div class="section-title">Financial Snapshot</div>'+
      statLine("Revenue (Current Year)", fmtINR(app.fin.curRevenue))+
      statLine("Profit (Current Year)", fmtINR(app.fin.curProfit))+
      statLine("Existing Debt", fmtINR(app.fin.totalDebt))+
      statLine("Cash Flow for Debt Service", fmtINR(app.fin.cashFlow))+
      statLine("Profit Margin", fmtNum(r.profitMargin)+"%")+
      statLine("Revenue Growth", fmtNum(r.revenueGrowth)+"%")+
    '</div>'+
    '<div class="card">'+
      '<div class="section-title">Continue Application</div><div class="section-sub">Jump directly to the next step in the origination workflow</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px;">'+
        stepLink("&#128193;","Review Documents","documents")+
        stepLink("&#128200;","Run Financial Analysis","financials")+
        stepLink("&#128179;","View Credit Assessment","credit")+
        stepLink("&#129518;","Calculate Loan Eligibility","eligibility")+
        stepLink("&#10024;","View AI Business Insights","aiinsights")+
        stepLink("&#127919;","Loan Recommendation","recommendation")+
        stepLink("&#9989;","Application Decision","decision")+
      '</div>'+
    '</div>'+
  '</div>'+
  disclaimerHTML();
}

function statLine(k,v){ return '<div class="stat-line"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>'; }
function stepLink(ico,label,view){
  return '<div class="app-picker-item" style="margin-bottom:0;" onclick="navigate(\''+view+'\')"><div style="display:flex;align-items:center;gap:10px;"><span>'+ico+'</span><span style="font-weight:700;font-size:12.8px;">'+label+'</span></div><span>&rarr;</span></div>';
}

/* ===================== DOCUMENTS ===================== */
function documentsHTML(){
  const app = getApp(UI.appId);
  const dc = docCompletion(app);
  const rows = DOC_LIST.map(doc=>{
    const status = app.documents[doc.key];
    const badgeCls = {"Pending":"badge-Pending","Uploaded":"badge-Uploaded","Under Verification":"badge-UnderVerification","Verified":"badge-Verified"}[status];
    const btnDisabled = status==="Verified" ? "disabled" : "";
    return '<div class="doc-row">'+
      '<div class="doc-ico">'+doc.ico+'</div>'+
      '<div class="doc-info"><div class="doc-name">'+doc.label+'</div><div class="doc-desc">'+doc.desc+'</div></div>'+
      '<span class="badge '+badgeCls+'">'+status+'</span>'+
      '<button class="btn btn-outline btn-sm" '+btnDisabled+' onclick="advanceDoc(\''+app.id+'\',\''+doc.key+'\')" style="min-width:150px;justify-content:center;">'+DOC_ACTION_LABEL[status]+'</button>'+
    '</div>';
  }).join("");

  return pageHead(app.businessName+" &mdash; Documents", "Document checklist and verification status", "Document Collection") +
  '<div class="card" style="margin-bottom:16px;">'+
    '<div class="card-row"><div><div class="section-title" style="margin-bottom:6px;">Application Document Completion: '+dc+'%</div><div class="section-sub" style="margin-bottom:0;">Click the action button on each document to simulate upload &rarr; verification.</div></div></div>'+
    '<div class="meter-track" style="height:10px;"><div class="meter-fill" style="width:'+dc+'%;"></div></div>'+
  '</div>'+
  '<div class="card">'+rows+'</div>'+
  '<div class="callout callout-info" style="margin-top:16px;">&#8505;&#65039; This is a simulated upload flow for prototype purposes &mdash; no files are actually transmitted or stored.</div>'+
  disclaimerHTML();
}

function advanceDoc(appId, key){
  const app = getApp(appId);
  const cur = app.documents[key];
  app.documents[key] = DOC_NEXT[cur];
  render();
}

/* ===================== FINANCIAL ANALYSIS ===================== */
function financialsHTML(){
  const app = getApp(UI.appId);
  const r = calcRatios(app.fin);
  const health = financialHealth(r);
  const healthColor = {"Excellent":"var(--green-600)","Good":"var(--teal-600)","Moderate":"var(--amber-600)","Weak":"var(--red-600)"}[health];
  const healthBg = {"Excellent":"var(--green-100)","Good":"var(--teal-100)","Moderate":"var(--amber-100)","Weak":"var(--red-100)"}[health];

  const inputRows = FIN_FIELDS.map(fld=>{
    return '<div class="field"><label>'+fld.label+'</label><input type="number" value="'+app.fin[fld.key]+'" onchange="updateFinField(\''+app.id+'\',\''+fld.key+'\',this.value)"/></div>';
  }).join("");

  const ratioCard = (title, value, tooltip, interp) => {
    const toneColor = {good:"var(--green-600)", ok:"var(--teal-600)", warn:"var(--amber-600)", bad:"var(--red-600)"}[interp.tone];
    return '<div class="card">'+
      '<div class="tip" style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.03em;">'+title+'<span class="tt">'+tooltip+'</span></div>'+
      '<div class="mono" style="font-size:22px;font-weight:700;color:var(--navy-950);margin:6px 0 4px 0;">'+value+'</div>'+
      '<div style="font-size:11.5px;font-weight:700;color:'+toneColor+';">'+interp.tag+'</div>'+
    '</div>';
  };

  return pageHead(app.businessName+" &mdash; Financial Analysis", "Enter or review financial data to compute key lending ratios automatically", "Financial Analysis") +

  '<div class="two-col">'+
    '<div>'+
      '<div class="grid grid-3" style="margin-bottom:14px;">'+
        ratioCard("Revenue Growth", fmtNum(r.revenueGrowth)+"%", "Year-on-year growth in business revenue.", interpretRatio("revenueGrowth",r.revenueGrowth))+
        ratioCard("Profit Margin", fmtNum(r.profitMargin)+"%", "Net profit as a percentage of revenue.", interpretRatio("profitMargin",r.profitMargin))+
        ratioCard("Current Ratio", fmtNum(r.currentRatio,2)+"x", "Current assets divided by current liabilities &mdash; short-term liquidity.", interpretRatio("currentRatio",r.currentRatio))+
      '</div>'+
      '<div class="grid grid-3" style="margin-bottom:16px;">'+
        ratioCard("Debt Level (D/E)", fmtNum(r.debtEquity,2)+"x", "Total debt divided by equity &mdash; overall leverage.", interpretRatio("debtEquity",r.debtEquity))+
        ratioCard("DSCR (Repayment Capacity)", fmtNum(r.dscr,2)+"x", "Shows how comfortably the business can repay its debt obligations.", interpretRatio("dscr",r.dscr))+
        '<div class="card" style="display:flex;flex-direction:column;justify-content:center;align-items:center;background:'+healthBg+';border-color:'+healthBg+';">'+
          '<div style="font-size:11px;font-weight:700;color:'+healthColor+';text-transform:uppercase;letter-spacing:.04em;">Financial Health</div>'+
          '<div style="font-family:var(--font-display);font-weight:800;font-size:19px;color:'+healthColor+';margin-top:4px;">'+health+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="callout callout-warn">&#9888;&#65039; These interpretations are for academic demonstration only and should not be presented as actual bank underwriting rules.</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="section-title">Financial Inputs</div><div class="section-sub">Editable sample data &mdash; ratios recalculate automatically on change</div>'+
      '<div style="display:flex;flex-direction:column;gap:12px;">'+inputRows+'</div>'+
    '</div>'+
  '</div>'+
  disclaimerHTML();
}

function updateFinField(appId, key, value){
  const app = getApp(appId);
  app.fin[key] = parseFloat(value)||0;
  render();
}

/* ===================== CREDIT ASSESSMENT ===================== */
function creditHTML(){
  const app = getApp(UI.appId);
  const cs = calcCreditScore(app);
  const insights = aiInsights(app);
  const pct = clamp(cs.total,0,100);
  const angle = (pct/100)*180;
  const gaugeColor = cs.risk==="Low Risk" ? "#1C7F51" : (cs.risk==="Moderate Risk" ? "#B4720A" : "#B93B3B");

  const breakdownRows = Object.values(cs.breakdown).map(b=>{
    const w = Math.round((b.score/b.max)*100);
    return '<div style="margin-bottom:11px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>'+b.label+'</span><span class="mono" style="font-weight:700;">'+fmtNum(b.score,1)+' / '+b.max+'</span></div><div class="meter-track"><div class="meter-fill" style="width:'+w+'%;background:'+gaugeColor+';"></div></div></div>';
  }).join("");

  return pageHead(app.businessName+" &mdash; Credit Assessment", "Prototype MSME credit scoring model based on illustrative weighted factors", "Credit Assessment") +
  '<div class="callout callout-disclaimer" style="margin-bottom:16px;">&#128220; <strong>Prototype Credit Scoring Model &mdash; For Academic Demonstration Only.</strong> Weights and thresholds are illustrative and not based on any actual bank policy.</div>'+

  '<div class="two-col">'+
    '<div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">'+
      '<div class="section-title">Credit Risk Score</div>'+
      '<svg viewBox="0 0 200 110" style="width:220px;margin:8px 0 4px 0;">'+
        '<path d="M15 100 A85 85 0 0 1 185 100" fill="none" stroke="#E7ECF3" stroke-width="16" stroke-linecap="round"/>'+
        '<path d="M15 100 A85 85 0 0 1 185 100" fill="none" stroke="'+gaugeColor+'" stroke-width="16" stroke-linecap="round" stroke-dasharray="'+(angle/180*267)+' 267"/>'+
        '<text x="100" y="90" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="30" font-weight="700" fill="#152238">'+fmtNum(cs.total,0)+'</text>'+
        '<text x="100" y="106" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="#8B98AC">out of 100</text>'+
      '</svg>'+
      '<span class="badge '+riskBadgeClass(cs.risk)+'" style="font-size:13px;padding:6px 16px;margin-top:8px;">'+cs.risk.toUpperCase()+'</span>'+
      '<div class="divider" style="width:100%;"></div>'+
      '<div style="text-align:left;width:100%;">'+
        '<div class="section-sub" style="margin-bottom:8px;">Risk bands: 75&ndash;100 Low &middot; 50&ndash;74 Moderate &middot; below 50 High</div>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="section-title">Score Breakdown</div><div class="section-sub">Illustrative weights: Credit History 25% &middot; Revenue Growth 20% &middot; Profitability 15% &middot; Banking Behaviour 15% &middot; Vintage 10% &middot; Existing Debt 10% &middot; Compliance 5%</div>'+
      breakdownRows+
    '</div>'+
  '</div>'+

  '<div class="grid grid-2" style="margin-top:16px;">'+
    '<div class="card"><div class="section-title">Positive Factors</div><ul class="list-strengths">'+insights.strengths.map(s=>'<li>'+s+'</li>').join("")+'</ul></div>'+
    '<div class="card"><div class="section-title">Risk Factors</div><ul class="list-concerns">'+insights.concerns.map(s=>'<li>'+s+'</li>').join("")+'</ul></div>'+
  '</div>'+

  '<div class="card" style="margin-top:16px;">'+
    '<div class="section-title">Adjust Manual Inputs</div><div class="section-sub">Credit History and Banking Behaviour are relationship-manager assessed inputs in this prototype (bureau/banking data would feed these in a real system)</div>'+
    '<div class="form-grid">'+
      '<div class="field"><label>Credit History Score (out of 25)</label><input type="number" min="0" max="25" value="'+app.creditInputs.creditHistory+'" onchange="updateCreditInput(\''+app.id+'\',\'creditHistory\',this.value,25)"/></div>'+
      '<div class="field"><label>Banking Behaviour Score (out of 15)</label><input type="number" min="0" max="15" value="'+app.creditInputs.bankingBehaviour+'" onchange="updateCreditInput(\''+app.id+'\',\'bankingBehaviour\',this.value,15)"/></div>'+
    '</div>'+
  '</div>'+
  disclaimerHTML();
}

function updateCreditInput(appId, key, value, max){
  const app = getApp(appId);
  app.creditInputs[key] = clamp(parseFloat(value)||0,0,max);
  render();
}

/* ===================== LOAN ELIGIBILITY ===================== */
function eligibilityHTML(){
  const app = getApp(UI.appId);
  const cs = calcCreditScore(app);
  const base = calcEligibility(app);

  return pageHead(app.businessName+" &mdash; Loan Eligibility", "Indicative Eligibility &mdash; not an actual lending decision", "Loan Eligibility Calculator") +
  '<div class="two-col">'+
    '<div class="card">'+
      '<div class="section-title">Indicative Eligibility Calculator</div>'+
      '<div class="section-sub">Adjust the loan amount, interest rate or tenure below to see the EMI update instantly.</div>'+
      '<div class="grid grid-2" style="margin-bottom:14px;">'+
        '<div class="stat-line"><span class="k">Loan Requested</span><span class="v">'+fmtINR(app.loan.amount)+'</span></div>'+
        '<div class="stat-line"><span class="k">Indicative Eligible Amount</span><span class="v" style="color:var(--teal-600);">'+fmtINR(base.eligible)+'</span></div>'+
      '</div>'+
      '<div class="form-grid">'+
        '<div class="field"><label>Loan Amount (&#8377;)</label><input id="emiAmount" type="number" value="'+base.eligible+'" oninput="liveEMI(\''+app.id+'\')"/></div>'+
        '<div class="field"><label>Interest Rate (% p.a.)</label><input id="emiRate" type="number" step="0.05" value="'+base.rate+'" oninput="liveEMI(\''+app.id+'\')"/></div>'+
        '<div class="field field-span2"><label>Tenure (years)</label><input id="emiTenure" type="number" step="1" min="1" value="'+base.tenure+'" oninput="liveEMI(\''+app.id+'\')"/></div>'+
      '</div>'+
      '<div class="divider"></div>'+
      '<div class="grid grid-3">'+
        '<div class="card" style="background:var(--bg);"><div class="kpi-label">Estimated EMI</div><div id="emiResult" class="mono" style="font-size:20px;font-weight:700;margin-top:4px;">'+fmtINR(base.emi)+'</div></div>'+
        '<div class="card" style="background:var(--bg);"><div class="kpi-label">Total Payment</div><div id="emiTotal" class="mono" style="font-size:20px;font-weight:700;margin-top:4px;">'+fmtINR(base.totalPayment)+'</div></div>'+
        '<div class="card" style="background:var(--bg);"><div class="kpi-label">Total Interest</div><div id="emiInterest" class="mono" style="font-size:20px;font-weight:700;margin-top:4px;">'+fmtINR(base.totalPayment-base.eligible)+'</div></div>'+
      '</div>'+
      '<div class="callout callout-warn" style="margin-top:14px;">&#9888;&#65039; This is an <strong>Indicative Eligibility</strong> estimate for demonstration purposes, not an actual credit sanction or lending decision.</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="section-title">Basis of Calculation</div><div class="section-sub">How the indicative eligible amount was derived (prototype logic)</div>'+
      statLine("Credit Risk Category", '<span class="badge '+riskBadgeClass(cs.risk)+'">'+riskWord(cs.risk)+'</span>')+
      statLine("Annual Profit", fmtINR(app.fin.curProfit))+
      statLine("Profit-based Cap (4x profit)", fmtINR(app.fin.curProfit*4))+
      statLine("Cash Flow for Debt Service", fmtINR(app.fin.cashFlow))+
      statLine("Target Minimum DSCR", "1.25x")+
      statLine("Indicative Rate (risk-based)", fmtNum(indicativeRate(cs.risk, app))+"%")+
      '<div class="divider"></div>'+
      '<div class="section-sub">Eligible amount = lower of (a) requested amount, (b) ~4&times; annual profit, and (c) the loan size the business cash flow can service at a minimum 1.25x DSCR over the chosen tenure.</div>'+
    '</div>'+
  '</div>'+
  rbiPricingCardHTML(app)+
  disclaimerHTML();
}

function rbiPricingCardHTML(app){
  const fr = finalLendingRate(app);
  const seg = bankSegmentFor(app.loan.amount);
  return '<div class="card" style="margin-top:16px;">'+
    '<div class="card-row"><div><div class="section-title" style="margin-bottom:0;">RBI-Linked Rate Build-up</div><div class="section-sub" style="margin-bottom:0;">External benchmark (RBI Repo Rate) + bank spread, per the Bank Spread framework</div></div>'+
    (AUTH.role==="rm" ? '<button class="btn btn-outline btn-sm" onclick="promptRepoRate()">Update RBI Repo Rate</button>' : '')+
    '</div>'+
    '<div class="callout callout-info" style="margin:10px 0 14px 0;">&#8505;&#65039; RBI does not expose a public, CORS-enabled API for the Repo Rate, so this prototype cannot poll rbi.org.in directly from the browser. The Repo Rate below is a manually-refreshed benchmark (RM-editable) that every calculation on this page is linked to &mdash; change it once and pricing recalculates everywhere.</div>'+
    '<div class="grid grid-2">'+
      '<div>'+
        statLine("RBI Repo Rate (external benchmark)", fr.repoRate+"% <span style=\"font-weight:400;color:var(--text-faint);\">as of "+RBI_REPO_LAST_UPDATED+"</span>")+
        statLine("Funding/Cost of Funds Adj.", "+"+fr.spread.fundingCostAdj+"%")+
        statLine("Operating Cost", "+"+fr.spread.operatingCost+"%")+
        statLine("Credit Risk Premium (PD&times;LGD&times;EAD/Loan)", "+"+fmtNum(fr.spread.creditRiskPremium,2)+"%")+
        statLine("Tenor/Liquidity Premium", "+"+fr.spread.tenorLiquidityPremium+"%")+
        statLine("Capital Charge", "+"+fr.spread.capitalCharge+"%")+
        statLine("Profit Margin", "+"+fr.spread.profitMargin+"%")+
        statLine("Risk Mitigants (secured/CGTMSE)", "&minus;"+fr.spread.riskMitigants+"%")+
      '</div>'+
      '<div>'+
        '<div class="card" style="background:var(--bg);text-align:center;">'+
          '<div class="kpi-label">Final Indicative Lending Rate</div>'+
          '<div class="mono" style="font-size:26px;font-weight:700;color:var(--navy-950);margin-top:6px;">'+fr.rate+'% p.a.</div>'+
          '<div style="font-size:11px;color:var(--text-faint);margin-top:4px;">Repo ('+fr.repoRate+'%) + Total Spread ('+fr.spread.totalSpread+'%) '+(app.interestRateType==="Fixed"?"+ fixed-rate loading (0.5%)":"")+'</div>'+
        '</div>'+
        '<div class="divider"></div>'+
        statLine("Bank Segment (by ticket size)", seg.segment)+
        statLine("MSME Category for Segment", seg.category)+
        statLine("Typical Products for Segment", seg.products)+
        statLine("Indicative Tenure Band", seg.tenure)+
      '</div>'+
    '</div>'+
  '</div>';
}
function promptRepoRate(){
  const v = prompt("Enter the new RBI Repo Rate (%), per the latest MPC announcement:", RBI_REPO_RATE);
  if(v===null) return;
  const d = prompt("Effective date of this MPC decision (YYYY-MM-DD):", new Date().toISOString().slice(0,10));
  setRepoRate(v, d);
  render();
  showToast("RBI Repo Rate updated to "+RBI_REPO_RATE+"% — all indicative pricing recalculated.");
}

function liveEMI(appId){
  const app = getApp(appId);
  const amount = parseFloat(document.getElementById("emiAmount").value)||0;
  const rate = parseFloat(document.getElementById("emiRate").value)||0;
  const tenure = parseFloat(document.getElementById("emiTenure").value)||1;
  const emi = calcEMI(amount, rate, tenure);
  const total = emi*Math.round(tenure*12);
  document.getElementById("emiResult").textContent = fmtINR(emi);
  document.getElementById("emiTotal").textContent = fmtINR(total);
  document.getElementById("emiInterest").textContent = fmtINR(total-amount);
  UI.eligOverride[appId] = {amount, rate, tenure};
}

/* ===================== AI BUSINESS INSIGHTS ===================== */
function aiInsightsHTML(){
  const app = getApp(UI.appId);
  const ins = aiInsights(app);
  return pageHead(app.businessName+" &mdash; AI Business Insights", "AI-generated prototype insight based on entered business and financial information", "AI Business Insights") +
  '<div class="callout callout-disclaimer" style="margin-bottom:16px;">&#10024; <strong>AI-generated prototype insight.</strong> This is a rules-based illustrative summary for demonstration, not an actual credit approval or underwriting output.</div>'+
  '<div class="card" style="margin-bottom:16px;">'+
    '<div class="section-title">AI Business Assessment</div>'+
    '<p style="font-size:13.3px;line-height:1.7;color:var(--text);margin-top:10px;">'+ins.paragraph+'</p>'+
  '</div>'+
  '<div class="grid grid-2" style="margin-bottom:16px;">'+
    '<div class="card"><div class="section-title">Strengths</div><ul class="list-strengths">'+ins.strengths.map(s=>'<li>'+s+'</li>').join("")+'</ul></div>'+
    '<div class="card"><div class="section-title">Concerns</div><ul class="list-concerns">'+ins.concerns.map(s=>'<li>'+s+'</li>').join("")+'</ul></div>'+
  '</div>'+
  '<div class="grid grid-2">'+
    '<div class="card"><div class="kpi-label">Suggested Loan Purpose</div><div style="font-family:var(--font-display);font-weight:800;font-size:16px;margin-top:6px;">'+ins.suggestedPurpose+'</div></div>'+
    '<div class="card"><div class="kpi-label">Suggested Customer Segment</div><div style="font-family:var(--font-display);font-weight:800;font-size:16px;margin-top:6px;">'+ins.segment.maturity+' ('+ins.segment.size+')</div></div>'+
  '</div>'+
  disclaimerHTML();
}

/* ===================== LOAN RECOMMENDATION ===================== */
function recommendationHTML(){
  const app = getApp(UI.appId);
  const rec = recommendation(app);
  return pageHead(app.businessName+" &mdash; Loan Recommendation", "Suggested loan product based on stated purpose and eligibility", "Loan Product Recommendation") +
  '<div class="card" style="margin-bottom:16px;border:2px solid var(--teal-500);">'+
    '<div class="crumb">Primary Recommendation</div>'+
    '<div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--navy-950);margin:4px 0 10px 0;">'+rec.primary+'</div>'+
    '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">'+rec.why+'</div>'+
    '<div class="grid grid-4">'+
      '<div class="stat-line" style="flex-direction:column;align-items:flex-start;gap:4px;"><span class="k">Recommended Amount</span><span class="v" style="font-size:16px;">'+fmtINR(rec.amount)+'</span></div>'+
      '<div class="stat-line" style="flex-direction:column;align-items:flex-start;gap:4px;"><span class="k">Suggested Tenure</span><span class="v" style="font-size:16px;">'+rec.tenure+' years</span></div>'+
      '<div class="stat-line" style="flex-direction:column;align-items:flex-start;gap:4px;"><span class="k">Indicative Interest Rate</span><span class="v" style="font-size:16px;">'+fmtNum(rec.rate)+'%</span></div>'+
      '<div class="stat-line" style="flex-direction:column;align-items:flex-start;gap:4px;"><span class="k">Estimated EMI</span><span class="v" style="font-size:16px;">'+fmtINR(rec.emi)+'</span></div>'+
    '</div>'+
  '</div>'+
  '<div class="card">'+
    '<div class="section-title">Alternative Product Options</div><div class="section-sub">Other MSME products the RM may also consider</div>'+
    '<div class="chip-row">'+rec.alternatives.map(a=>'<span class="chip">'+a+'</span>').join("")+'</div>'+
  '</div>'+
  disclaimerHTML();
}

/* ===================== APPLICATION DECISION ===================== */
function decisionHTML(){
  const app = getApp(UI.appId);
  const r = calcRatios(app.fin);
  const cs = calcCreditScore(app);
  const dc = docCompletion(app);
  const rec = recommendation(app);
  const elig = calcEligibility(app);

  let finalReco = "Recommended for Credit Review";
  let finalColor = "var(--teal-600)"; let finalBg="var(--teal-100)";
  if(cs.risk==="High Risk" || dc<50){ finalReco = "Not Recommended at Current Stage"; finalColor="var(--red-600)"; finalBg="var(--red-100)"; }
  else if(cs.risk==="Low Risk" && dc>=90){ finalReco = "Recommended for Approval"; finalColor="var(--green-600)"; finalBg="var(--green-100)"; }

  const decisionBanner = app.decision ? '<div class="callout callout-info" style="margin-bottom:16px;">Latest workflow action recorded: <strong>'+app.decision+'</strong></div>' : "";

  return pageHead(app.businessName+" &mdash; Application Decision", "Consolidated summary and prototype workflow decision", "Application Decision") +
  decisionBanner+
  '<div class="grid grid-2" style="margin-bottom:16px;">'+
    '<div class="card">'+
      '<div class="section-title">Application Summary</div>'+
      statLine("Customer", app.businessName)+
      statLine("Loan Requested", fmtINR(app.loan.amount))+
      statLine("Indicative Eligible Amount", fmtINR(elig.eligible))+
      statLine("Credit Risk Score", fmtNum(cs.total,0)+"/100")+
      statLine("Risk Category", '<span class="badge '+riskBadgeClass(cs.risk)+'">'+riskWord(cs.risk)+'</span>')+
      statLine("Document Completion", dc+"%")+
      statLine("DSCR (Repayment Capacity)", fmtNum(r.dscr,2)+"x")+
      statLine("Recommended Product", rec.primary)+
    '</div>'+
    '<div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:'+finalBg+';">'+
      '<div class="kpi-label" style="color:'+finalColor+';">Final Prototype Recommendation</div>'+
      '<div style="font-family:var(--font-display);font-weight:800;font-size:19px;color:'+finalColor+';margin-top:10px;">'+finalReco+'</div>'+
      '<div style="font-size:11.5px;color:var(--text-muted);margin-top:10px;">AI Assessment: suitable for further credit evaluation, subject to document verification and underwriting.</div>'+
    '</div>'+
  '</div>'+
  (AUTH.role==="rm" ?
  '<div class="card">'+
    '<div class="section-title">Prototype Workflow Actions</div><div class="section-sub">These update the application\'s pipeline stage in this demo &mdash; they are not real loan approvals.</div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
      '<button class="btn btn-primary" onclick="makeDecision(\''+app.id+'\',\'approve\')">&#9989; Recommend for Approval</button>'+
      '<button class="btn btn-navy" onclick="makeDecision(\''+app.id+'\',\'review\')">&#128269; Send for Further Review</button>'+
      '<button class="btn btn-outline" onclick="makeDecision(\''+app.id+'\',\'docs\')">&#128193; Mark Documents Pending</button>'+
      '<button class="btn btn-danger" onclick="makeDecision(\''+app.id+'\',\'reject\')">&#10060; Reject Application</button>'+
    '</div>'+
  '</div>' : '<div class="callout callout-info">Your Relationship Manager will update this status as your application progresses. This view is read-only.</div>')+
  disclaimerHTML();
}

function makeDecision(appId, action){
  const app = getApp(appId);
  if(action==="approve"){ app.stage="Approved"; app.decision="Recommended for Approval"; }
  else if(action==="review"){ app.stage="Credit Assessment"; app.decision="Sent for Further Review"; }
  else if(action==="docs"){ app.stage="Documents Pending"; app.decision="Marked Documents Pending"; }
  else if(action==="reject"){ app.stage="Rejected"; app.decision="Application Rejected"; }
  render();
  showToast("Prototype workflow action recorded: "+app.decision);
}

/* ===================== APPLICATION TRACKING ===================== */
function trackingHTML(){
  const industries = Array.from(new Set(applications.map(a=>a.industry)));
  let list = filteredForSearch(applications);
  const f = UI.trackerFilters;
  if(f.status!=="All") list = list.filter(a=>a.stage===f.status);
  if(f.risk!=="All") list = list.filter(a=>calcCreditScore(a).risk===f.risk);
  if(f.industry!=="All") list = list.filter(a=>a.industry===f.industry);

  const nextActionFor = (a)=>{
    const dc = docCompletion(a);
    if(a.stage==="New") return "Collect documents";
    if(a.stage==="Documents Pending") return dc<100 ? "Complete document verification" : "Move to Documents Verified";
    if(a.stage==="Documents Verified") return "Run financial analysis";
    if(a.stage==="Financial Analysis") return "Proceed to credit assessment";
    if(a.stage==="Credit Assessment") return "Generate recommendation";
    if(a.stage==="Recommended") return "Take application decision";
    if(a.stage==="Approved") return "Proceed to disbursement";
    if(a.stage==="Rejected") return "Closed";
    if(a.stage==="Disbursed") return "Completed";
    return "-";
  };

  const rows = list.map(a=>{
    const cs = calcCreditScore(a);
    const stageOptions = STAGES.map(s=>'<option value="'+s+'" '+(s===a.stage?"selected":"")+'>'+s+'</option>').join("");
    return '<tr>'+
      '<td class="mono">'+a.id+'</td>'+
      '<td><div class="tbl-name">'+a.businessName+'</div><div class="tbl-sub">'+a.industry+'</div></td>'+
      '<td class="mono">'+fmtINR(a.loan.amount)+'</td>'+
      '<td><select onchange="advanceStage(\''+a.id+'\',this.value)" style="border:1px solid var(--border);border-radius:6px;padding:5px 7px;font-size:11.5px;">'+stageOptions+'</select></td>'+
      '<td><span class="badge '+riskBadgeClass(cs.risk)+'">'+riskWord(cs.risk)+'</span></td>'+
      '<td class="tbl-sub">'+a.rm+'</td>'+
      '<td class="tbl-sub">'+a.date+'</td>'+
      '<td style="font-size:11.5px;color:var(--text-muted);">'+nextActionFor(a)+'</td>'+
      '<td><button class="btn btn-ghost btn-sm" onclick="selectApp(\''+a.id+'\',\'profile\')">Open</button></td>'+
    '</tr>';
  }).join("");

  const statusOpts = ["All"].concat(STAGES).map(s=>'<option value="'+s+'" '+(UI.trackerFilters.status===s?"selected":"")+'>'+s+'</option>').join("");
  const riskOpts = ["All","Low Risk","Moderate Risk","High Risk"].map(s=>'<option value="'+s+'" '+(UI.trackerFilters.risk===s?"selected":"")+'>'+s+'</option>').join("");
  const indOpts = ["All"].concat(industries).map(s=>'<option value="'+s+'" '+(UI.trackerFilters.industry===s?"selected":"")+'>'+s+'</option>').join("");

  return pageHead("Application Tracking", "Track and progress every MSME application through the origination pipeline") +
  '<div class="filter-bar">'+
    '<select onchange="setTrackerFilter(\'status\',this.value)">'+statusOpts+'</select>'+
    '<select onchange="setTrackerFilter(\'risk\',this.value)">'+riskOpts+'</select>'+
    '<select onchange="setTrackerFilter(\'industry\',this.value)">'+indOpts+'</select>'+
    (f.status!=="All"||f.risk!=="All"||f.industry!=="All" ? '<button class="btn btn-ghost btn-sm" onclick="clearTrackerFilters()">Clear filters</button>' : "")+
  '</div>'+
  '<div class="card">'+
    '<div style="overflow-x:auto;"><table><thead><tr><th>App ID</th><th>Customer</th><th>Amount</th><th>Current Stage</th><th>Risk</th><th>RM</th><th>Date</th><th>Next Action</th><th></th></tr></thead><tbody>'+
    (rows || '<tr><td colspan="9" style="text-align:center;color:var(--text-faint);padding:24px;">No applications match the selected filters.</td></tr>')+
    '</tbody></table></div>'+
  '</div>'+
  disclaimerHTML();
}

function setTrackerFilter(key, value){ UI.trackerFilters[key]=value; render(); }
function clearTrackerFilters(){ UI.trackerFilters={status:"All",risk:"All",industry:"All"}; render(); }
function advanceStage(appId, stage){ const app=getApp(appId); app.stage=stage; render(); showToast(app.businessName+" moved to \""+stage+"\""); }

/* ===================== NAV / GLOBAL HANDLERS ===================== */
function navigate(view){ UI.view = view; UI.sidebarOpen = false; UI.profileMenuOpen = false; render(); window.scrollTo(0,0); }
function selectApp(id, thenView){ UI.appId = id; UI.view = thenView; render(); window.scrollTo(0,0); }
function onGlobalSearch(v){ UI.search = v; render(); document.getElementById("globalSearch").focus(); document.getElementById("globalSearch").selectionStart = document.getElementById("globalSearch").selectionEnd = v.length; }

let toastTimer=null;
function showToast(msg){
  const host = document.getElementById("toastHost");
  host.innerHTML = '<div class="toast">&#9989; '+msg+'</div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ host.innerHTML=""; }, 3200);
}

/* ===================== INIT ===================== */
loadData();
render();
