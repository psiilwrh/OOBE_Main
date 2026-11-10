#!/usr/bin/env python3
"""
Generate the structured data (JSON-LD) for every page of oobe.ca.

Reads the visible content of each page (FAQs, services, plans) so the structured
data always matches what visitors see, then writes one
<script type="application/ld+json"> block into each page's <head>.

Run it after editing FAQs, services or plans:

    python3 scripts/schema.py

No dependencies beyond Python 3.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://www.oobe.ca"
ORG_ID = SITE + "/#organization"
WEBSITE_ID = SITE + "/#website"
LOGO = SITE + "/logo.svg"
MARK = "<!-- schema.py: generated structured data, do not edit by hand -->"

AREA = [
    {"@type": "Country", "name": "Canada"},
    {"@type": "Country", "name": "United States"},
    {"@type": "City", "name": "Toronto"},
]

# serviceType wording (what people search for) for each service on /services
SERVICE_TYPES = {
    "it-consulting": "IT consulting",
    "cloud-consulting": "Cloud consulting and cloud migration",
    "microsoft": "Microsoft 365, Azure and Dynamics 365 consulting",
    "ai": "AI consulting, AI implementation, AI policy and AI governance",
    "virtualization": "VMware and Hyper-V virtualization",
    "backup-dr": "Backup and disaster recovery",
    "training": "Cybersecurity awareness training",
    "unified-communications": "Unified communications (UCaaS) and business VoIP",
}


def text(fragment):
    """Visible text of an HTML fragment."""
    fragment = re.sub(r"<span[^>]*aria-hidden=\"true\"[^>]*>.*?</span>", "", fragment, flags=re.S)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(fragment).split())


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def meta(page_html, name):
    m = re.search(r'<meta name="%s" content="([^"]*)"' % name, page_html)
    return html.unescape(m.group(1)) if m else ""


def title(page_html):
    return html.unescape(re.search(r"<title>(.*?)</title>", page_html, re.S).group(1)).strip()


def faqs(page_html):
    items = re.findall(r"<details><summary>(.*?)</summary>\s*<div class=\"ans\">(.*?)</div>\s*</details>", page_html, re.S)
    return [(text(q), text(a)) for q, a in items]


def faq_node(url, pairs):
    return {
        "@type": "FAQPage",
        "@id": url + "#faq",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in pairs
        ],
    }


def services():
    page = read("services.html")
    out = []
    for sid, body in re.findall(r'<article class="svc-entry" id="([^"]+)">(.*?)</article>', page, re.S):
        name = text(re.search(r"<h2[^>]*>(.*?)</h2>", body, re.S).group(1))
        desc = text(re.search(r"</h2>\s*<p>(.*?)</p>", body, re.S).group(1))
        caps = [text(li) for li in re.findall(r"<li>(.*?)</li>", body, re.S)]
        out.append((sid, name, desc, caps))
    return out


def organization(service_list):
    return {
        "@type": "ProfessionalService",
        "@id": ORG_ID,
        "name": "Out of Box Experience Inc.",
        "alternateName": ["OOBE", "Out of Box Experience", "OOBE.CA"],
        "url": SITE + "/",
        "logo": {"@type": "ImageObject", "@id": SITE + "/#logo", "url": LOGO, "contentUrl": LOGO, "caption": "OOBE"},
        "image": {"@id": SITE + "/#logo"},
        "slogan": "Technology that works out of the box.",
        "description": (
            "Out of Box Experience Inc. (OOBE) is a Canadian IT, cloud, AI and unified communications company "
            "based in Toronto, Ontario, serving clients across Canada and the United States. OOBE provides IT and "
            "cloud consulting, Microsoft 365 and Azure, AI consulting, implementation and governance, virtualization, "
            "backup and disaster recovery, cyber awareness training, and Cloud IP Phone business VoIP."
        ),
        "telephone": "+1-647-825-2552",
        "email": "info@oobe.ca",
        "address": {"@type": "PostalAddress", "addressLocality": "Toronto", "addressRegion": "ON", "addressCountry": "CA"},
        "areaServed": AREA,
        "contactPoint": [{
            "@type": "ContactPoint",
            "contactType": "sales",
            "telephone": "+1-647-825-2552",
            "email": "info@oobe.ca",
            "areaServed": ["CA", "US"],
            "availableLanguage": ["English"],
        }],
        "sameAs": ["https://www.linkedin.com/company/oobe-out-of-box-experience/"],
        "knowsAbout": [
            "IT consulting", "Managed IT services", "Cloud consulting", "Cloud migration", "Microsoft 365",
            "Microsoft Azure", "Dynamics 365", "Exchange Online", "Microsoft Copilot", "AI consulting",
            "AI implementation", "AI policy", "AI governance", "VMware", "Hyper-V", "Backup and disaster recovery",
            "Cybersecurity awareness training", "Unified communications", "UCaaS", "VoIP", "Cloud PBX",
            "SIP trunking", "Microsoft Teams Direct Routing",
        ],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "IT, cloud, AI and unified communications services",
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {"@id": "%s/services#%s" % (SITE, sid)}} for sid, *_ in service_list
            ] + [{"@type": "Offer", "itemOffered": {"@id": SITE + "/cloud-ip-phone#service"}}],
        },
    }


def website():
    return {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": SITE + "/",
        "name": "OOBE | Out of Box Experience Inc.",
        "inLanguage": "en-CA",
        "publisher": {"@id": ORG_ID},
    }


def webpage(url, page_html, kind="WebPage", crumb=None):
    node = {
        "@type": kind,
        "@id": url + "#webpage",
        "url": url,
        "name": title(page_html),
        "description": meta(page_html, "description"),
        "inLanguage": "en-CA",
        "isPartOf": {"@id": WEBSITE_ID},
        "about": {"@id": ORG_ID},
        "publisher": {"@id": ORG_ID},
    }
    if crumb:
        node["breadcrumb"] = {"@id": url + "#breadcrumb"}
    return node


def breadcrumb(url, crumb):
    return {
        "@type": "BreadcrumbList",
        "@id": url + "#breadcrumb",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": crumb, "item": url},
        ],
    }


def service_nodes(service_list):
    nodes = []
    for sid, name, desc, caps in service_list:
        nodes.append({
            "@type": "Service",
            "@id": "%s/services#%s" % (SITE, sid),
            "name": name,
            "serviceType": SERVICE_TYPES.get(sid, name),
            "description": desc,
            "url": "%s/services#%s" % (SITE, sid),
            "provider": {"@id": ORG_ID},
            "areaServed": AREA,
            "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": name,
                "itemListElement": [{"@type": "Offer", "itemOffered": {"@type": "Service", "name": c}} for c in caps],
            },
        })
    return nodes


def cloud_ip_phone_node():
    page = read("cloud-ip-phone.html")
    feats = [(text(b), text(s)) for b, s in re.findall(r'<div class="feat"><b>(.*?)</b><span>(.*?)</span></div>', page, re.S)]
    plans = []
    for body in re.findall(r'<div class="plan[^"]*">(.*?)</div>', page, re.S):
        tier = text(re.sub(r"<span>[^<]*</span>", "", re.search(r'<span class="tier">(.*?)</span>\s*<h3>', body, re.S).group(1)))
        headline = text(re.search(r"<h3>(.*?)</h3>", body, re.S).group(1))
        incl = [text(li) for li in re.findall(r"<li>(.*?)</li>", body, re.S)]
        plans.append({
            "@type": "Offer",
            "name": "Cloud IP Phone %s plan (%s)" % (tier, headline),
            "description": "Per user, monthly or annual. Includes: " + "; ".join(incl) + ".",
            "url": SITE + "/cloud-ip-phone#plans",
            "seller": {"@id": ORG_ID},
            "availability": "https://schema.org/InStock",
        })
    lede = re.search(r'<h1>.*?</h1>.*?<p class="lede"[^>]*>(.*?)</p>', page, re.S)
    return {
        "@type": "Service",
        "@id": SITE + "/cloud-ip-phone#service",
        "name": "Cloud IP Phone",
        "alternateName": ["Business VoIP", "Cloud phone system", "Hosted PBX", "Cloud PBX", "UCaaS"],
        "serviceType": "Unified communications as a service (UCaaS) and cloud VoIP business phone system",
        "description": text(lede.group(1)) if lede else meta(page, "description"),
        "url": SITE + "/cloud-ip-phone",
        "provider": {"@id": ORG_ID},
        "areaServed": AREA,
        "category": "Unified communications",
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Cloud IP Phone solutions",
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {"@type": "Service", "name": n, "description": d}} for n, d in feats
            ],
        },
        "offers": plans,
    }


def build():
    service_list = services()
    org, site = organization(service_list), website()
    pages = {
        "index.html": (SITE + "/", "WebPage", None),
        "services.html": (SITE + "/services", "CollectionPage", "Services"),
        "cloud-ip-phone.html": (SITE + "/cloud-ip-phone", "WebPage", "Cloud IP Phone"),
        "about.html": (SITE + "/about", "AboutPage", "About"),
        "contact.html": (SITE + "/contact", "ContactPage", "Contact"),
    }
    report = {}
    for name, (url, kind, crumb) in pages.items():
        page = read(name)
        graph = [org, site, webpage(url, page, kind, crumb)]
        if crumb:
            graph.append(breadcrumb(url, crumb))
        if name == "services.html":
            graph += service_nodes(service_list)
            graph[2]["mainEntity"] = {"@type": "ItemList", "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "item": {"@id": "%s/services#%s" % (SITE, s[0])}}
                for i, s in enumerate(service_list)]}
        if name == "cloud-ip-phone.html":
            graph.append(cloud_ip_phone_node())
            graph[2]["mainEntity"] = {"@id": SITE + "/cloud-ip-phone#service"}
        pairs = faqs(page)
        if pairs:
            graph.append(faq_node(url, pairs))
        data = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
        data = data.replace("</", "<\\/")
        block = '%s\n<script type="application/ld+json">\n%s\n</script>\n' % (MARK, data)

        # remove any previous structured data, then insert before </head>
        page = re.sub(r"(?:%s\n)?<script type=\"application/ld\+json\">.*?</script>\n?" % re.escape(MARK), "", page, flags=re.S)
        page = page.replace("</head>", block + "</head>", 1)
        (ROOT / name).write_text(page, encoding="utf-8")
        report[name] = ([n["@type"] for n in graph], len(pairs))
    return report


if __name__ == "__main__":
    for page, (types, n) in build().items():
        print("%-22s %s%s" % (page, ", ".join(types), "  (%d FAQs)" % n if n else ""))
