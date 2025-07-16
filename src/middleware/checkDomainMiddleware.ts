import { Request, Response, NextFunction } from "express";
import path from "path";
const fs = require("fs");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../config/config.yaml"), "utf8")
);

const browserUserAgents = [
  "ABrowse",
  "Acoo Browser",
  "America Online Browser",
  "AmigaVoyager",
  "AOL",
  "Arora",
  "Avant Browser",
  "Beonex",
  "BonEcho",
  "Browzar",
  "Camino",
  "Charon",
  "Cheshire",
  "Chimera",
  "Chrome",
  "ChromePlus",
  "Classilla",
  "CometBird",
  "Comodo_Dragon",
  "Conkeror",
  "Crazy Browser",
  "Cyberdog",
  "Deepnet Explorer",
  "DeskBrowse",
  "Dillo",
  "Dooble",
  "Edge",
  "Element Browser",
  "Elinks",
  "Enigma Browser",
  "EnigmaFox",
  "Epiphany",
  "Escape",
  "Firebird",
  "Firefox",
  "Fireweb Navigator",
  "Flock",
  "Fluid",
  "Galaxy",
  "Galeon",
  "GranParadiso",
  "GreenBrowser",
  "Hana",
  "HotJava",
  "IBM WebExplorer",
  "IBrowse",
  "iCab",
  "Iceape",
  "IceCat",
  "Iceweasel",
  "iNet Browser",
  "Internet Explorer",
  "iRider",
  "Iron",
  "K-Meleon",
  "K-Ninja",
  "Kapiko",
  "Kazehakase",
  "Kindle Browser",
  "KKman",
  "KMLite",
  "Konqueror",
  "LeechCraft",
  "Links",
  "Lobo",
  "lolifox",
  "Lorentz",
  "Lunascape",
  "Lynx",
  "Madfox",
  "Maxthon",
  "Midori",
  "Minefield",
  "Mozilla",
  "myibrow",
  "MyIE2",
  "Namoroka",
  "Navscape",
  "NCSA_Mosaic",
  "NetNewsWire",
  "NetPositive",
  "Netscape",
  "NetSurf",
  "OmniWeb",
  "Opera",
  "Orca",
  "Oregano",
  "osb-browser",
  "Palemoon",
  "Phoenix",
  "Pogo",
  "Prism",
  "QtWeb Internet Browser",
  "Rekonq",
  "retawq",
  "RockMelt",
  "Safari",
  "SeaMonkey",
  "Shiira",
  "Shiretoko",
  "Sleipnir",
  "SlimBrowser",
  "Stainless",
  "Sundance",
  "Sunrise",
  "surf",
  "Sylera",
  "Tencent Traveler",
  "TenFourFox",
  "theWorld Browser",
  "uzbl",
  "Vimprobable",
  "Vonkeror",
  "w3m",
  "WeltweitimnetzBrowser",
  "WorldWideWeb",
  "Wyzo",
  "Android Webkit Browser",
  "BlackBerry",
  "Blazer",
  "Bolt",
  "Browser for S60",
  "Doris",
  "Dorothy",
  "Fennec",
  "Go Browser",
  "IE Mobile",
  "Iris",
  "Maemo Browser",
  "MIB",
  "Minimo",
  "NetFront",
  "Opera Mini",
  "Opera Mobile",
  "SEMC-Browser",
  "Skyfire",
  "TeaShark",
  "Teleca-Obigo",
  "uZard Web",
  "Thunderbird",
  "AbiLogicBot",
  "Link Valet",
  "Link Validity Check",
  "LinkExaminer",
  "LinksManager.com_bot",
  "Mojoo Robot",
  "Notifixious",
  "online link validator",
  "Ploetz + Zeller",
  "Reciprocal Link System PRO",
  "REL Link Checker Lite",
  "SiteBar",
  "Vivante Link Checker",
  "W3C-checklink",
  "Xenu Link Sleuth",
  "EmailSiphon",
  "CSE HTML Validator",
  "CSSCheck",
  "Cynthia",
  "HTMLParser",
  "P3P Validator",
  "W3C_CSS_Validator_JFouffa",
  "W3C_Validator",
  "WDG_Validator",
  "Awasu",
  "Bloglines",
  "everyfeed-spider",
  "FeedFetcher-Google",
  "GreatNews",
  "Gregarius",
  "MagpieRSS",
  "NFReader",
  "UniversalFeedParser",
  "!Susie",
  "Amaya",
  "Cocoal.icio.us",
  "DomainsDB.net MetaCrawler",
  "gPodder",
  "GSiteCrawler",
  "iTunes",
  "lftp",
  "MetaURI",
  "MT-NewsWatcher",
  "Nitro PDF",
  "Snoopy",
  "URD-MAGPIE",
  "WebCapture",
  "Windows-Media-Player",
];

export function checkDomainMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const referer = req.get("referer");
  const userAgent = req.get("user-agent") || "";
  const projectKey = req.params.projectKey;
  const apiKey = req.query.key;

  console.log(`[SECURITY] 🔍 Incoming request to ${req.originalUrl}`);

  // Vérifie si le projet existe dans le fichier de config
  const project = config.projects?.[projectKey];
  if (!project) {
    console.warn(`[SECURITY] ❌ Project '${projectKey}' not found`);
    return res.status(500).send("Invalid project");
  }

  // 🔐 Vérification par clé API
  const expectedApiKey = project.apiKey;
  if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
    console.log("[SECURITY] ✅ Request allowed by valid API key");
    return next();
  }

  // ✅ Exception : domaine sparnatural.eu
  if (referer?.includes("services.sparnatural.eu")) {
    console.log(
      "[SECURITY] ✅ Allowed: referer contains services.sparnatural.eu"
    );
    return next();
  }

  // ✅ Exception : navigateur reconnu
  if (browserUserAgents.some((ua) => userAgent.includes(ua))) {
    console.log("[SECURITY] ✅ Allowed: user-agent identified as browser");
    return next();
  }

  // ❌ Vérifie si le referer appartient à la liste des domaines autorisés
  const allowedDomains: string[] = project.domains || [];
  if (!referer) {
    console.warn("[SECURITY] ❌ Missing Referer header");
    return res.status(500).send("Invalid incoming domain");
  }

  try {
    const refererDomain = new URL(referer).hostname;
    if (!allowedDomains.includes(refererDomain)) {
      console.warn(
        `[SECURITY] ❌ Unauthorized referer domain: '${refererDomain}'`
      );
      return res.status(500).send("Invalid incoming domain");
    }
  } catch (err) {
    console.error(`[SECURITY] ❌ Error parsing referer '${referer}':`, err);
    return res.status(500).send("Invalid referer");
  }

  console.log("[SECURITY] ✅ Request accepted by domain check");
  next();
}
