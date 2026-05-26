import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

export async function runScrapers() {
  const uri = process.env.MONGODB_URI || "";
  const dbName = process.env.MONGODB_DB_NAME || "yuvahub";
  
  if (!uri) {
    console.warn("No MONGODB_URI for scraper");
    return;
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log("[Scraper] Starting collection...");
    
    // Devpost Hackathons
    try {
        const dpresp = await fetch("https://devpost.com/api/hackathons");
        if (dpresp.ok) {
            const dpdata = await dpresp.json();
            const results = (dpdata.hackathons || []).map((h: any) => {
                const title = h.title || "Unknown";
                const fp = crypto.createHash("md5").update("devpost-" + title).digest("hex");
                return {
                    title,
                    description: h.description || `Hackathon hosted by ${h.organization_name}`,
                    organization: h.organization_name || "Devpost",
                    apply_link: h.url || "https://devpost.com",
                    tags: (h.submission_period_tags || []).map((t: any) => t.name).slice(0, 3),
                    type: "hackathon",
                    location: h.displayed_location?.location || "Online",
                    source: "devpost",
                    fingerprint: fp,
                    created_at: new Date(),
                    deadline: h.submission_period_ends_at
                }
            });
            let inserted = 0;
            for (const r of results) {
                const res = await db.collection("opportunities").updateOne(
                { fingerprint: r.fingerprint },
                { $setOnInsert: r },
                { upsert: true }
                );
                if (res.upsertedCount > 0) inserted++;
            }
            console.log(`[Scraper] Devpost added ${inserted} items.`);
        }
    } catch(e) { console.error("Devpost scraper failed:", e); }

    // Unstop Hackathons
    try {
        const usresp = await fetch("https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&page=1");
        if (usresp.ok) {
            const usdata = await usresp.json();
            const results = (usdata?.data?.data || []).map((h: any) => {
                const title = h.title || "Unknown Hackathon";
                const organization = h.organization?.name || h.organization?.seo_url || "Unstop";
                const fp = crypto.createHash("md5").update("unstop-" + title).digest("hex");
                return {
                    title,
                    description: h.short_desc || `Compete in ${title} and win prizes!`,
                    organization,
                    apply_link: `https://unstop.com/${h.public_url}`,
                    tags: (h.filters || []).map((t: any) => t.name).filter(Boolean).slice(0, 3),
                    type: "hackathon",
                    location: h.region || "Online",
                    source: "unstop",
                    fingerprint: fp,
                    created_at: new Date(),
                    deadline: h.regn_end || null
                }
            });
            let inserted = 0;
            for (const r of results) {
                const res = await db.collection("opportunities").updateOne(
                { fingerprint: r.fingerprint },
                { $setOnInsert: r },
                { upsert: true }
                );
                if (res.upsertedCount > 0) inserted++;
            }
            console.log(`[Scraper] Unstop added ${inserted} items.`);
        }
    } catch(e) { console.error("Unstop scraper failed:", e); }

    // Opportunities Circle Scraper
    try {
        console.log("[Scraper] Starting Opportunities Circle crawl...");
        let inserted = 0;
        let duplicateHits = 0;
        const duplicateThreshold = 5;

        // Iterate through first 3 pages
        for (let page = 1; page <= 3; page++) {
            if (duplicateHits >= duplicateThreshold) {
                console.log("[Scraper] Opportunities Circle: Duplicate threshold reached. Stopping crawl.");
                break;
            }

            const url = page === 1 
                ? "https://www.opportunitiescircle.com/explore-opportunities/" 
                : `https://www.opportunitiescircle.com/explore-opportunities/page/${page}/?sf_paged=${page}`;

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });
            if (!response.ok) {
                console.error(`[Scraper] Opportunities Circle: Page ${page} fetch failed: ${response.status}`);
                continue;
            }

            const html = await response.text();
            
            // Extract article blocks
            const articleRegex = /<article[^>]+?class="([^"]+?)"[^>]*>([\s\S]+?)<\/article>/gi;
            let match;
            let foundInPage = 0;

            while ((match = articleRegex.exec(html)) !== null) {
                if (duplicateHits >= duplicateThreshold) break;

                const classList = match[1];
                const articleHtml = match[2];

                // Parse title and details url
                const headingMatch = articleHtml.match(/<h[34][^>]*><a\s+href="([^"]+?)"[^>]*>([\s\S]+?)<\/a>/i);
                if (!headingMatch) continue;

                const sourceUrl = headingMatch[1].trim();
                const title = headingMatch[2].replace(/<[^>]+?>/g, "").trim();

                // Compute fingerprint hash using normalized title & URL
                const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const titleHash = crypto.createHash("md5").update(normalizedTitle).digest("hex");
                const urlHash = crypto.createHash("md5").update(sourceUrl).digest("hex");
                const fp = crypto.createHash("md5").update(`opportunities_circle:${titleHash}:${urlHash}`).digest("hex");

                // Check for duplicates in DB
                const exists = await db.collection("opportunities").findOne({ $or: [{ fingerprint: fp }, { fingerprint_hash: fp }] });
                if (exists) {
                    duplicateHits++;
                    continue;
                }

                foundInPage++;

                // Image extraction
                let imageUrl = "";
                const imgMatch = articleHtml.match(/<img[^>]+?(?:data-lazy-src|src)="([^"]+?)"/i);
                if (imgMatch) {
                    imageUrl = imgMatch[1];
                }
                if (!imageUrl || imageUrl.startsWith("data:")) {
                    const srcSetMatch = articleHtml.match(/data-lazy-srcset="([^"\s]+?)[ "\s]/i);
                    imageUrl = srcSetMatch ? srcSetMatch[1] : "";
                }
                if (!imageUrl || imageUrl.startsWith("data:")) {
                    imageUrl = "https://www.opportunitiescircle.com/wp-content/uploads/2021/04/opportunities-circle-logo.png";
                }

                // Deadline extraction
                let deadlineText = "Open";
                const customTextMatch = articleHtml.match(/<span class="elementor-icon-list-text elementor-post-info__item elementor-post-info__item--type-custom">([\s\S]+?)<\/span>/i);
                if (customTextMatch) {
                    deadlineText = customTextMatch[1].replace(/<[^>]+?>/g, "").trim();
                }

                // Tags and categories from WordPress post classes
                const classes = classList.split(" ");
                const tags: string[] = [];
                let category = "Scholarship";
                classes.forEach(c => {
                    if (c.startsWith("tag-")) {
                        tags.push(c.substring(4).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
                    }
                    if (c.startsWith("category-")) {
                        const rawCat = c.substring(9).replace("-", " ");
                        if (rawCat.toLowerCase().includes("scholarship")) category = "Scholarship";
                        else if (rawCat.toLowerCase().includes("internship")) category = "Internship";
                        else if (rawCat.toLowerCase().includes("fellowship")) category = "Fellowship";
                        else if (rawCat.toLowerCase().includes("competition") || rawCat.toLowerCase().includes("awards")) category = "Competition";
                        else category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
                    }
                });

                const cleanTags = Array.from(new Set(tags)).slice(0, 4);
                if (cleanTags.length === 0) {
                    cleanTags.push(category, "International Opportunity");
                }

                // Location resolving from tags fallback
                let location = "Global";
                for (const t of cleanTags) {
                    if (/usa|uk|australia|canada|germany|japan|europe/i.test(t)) {
                        location = t;
                        break;
                    }
                }

                // Scrape details from single post page
                let description = `Apply now for ${title}! Visity source link for complete program guidelines.`;
                let eligibility = "All international candidates are welcome to apply. Review source guidelines.";
                try {
                    const detailRes = await fetch(sourceUrl, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    });
                    if (detailRes.ok) {
                        const detailHtml = await detailRes.text();
                        // Get paragraphs inside entry-content or elementor-widget-theme-post-content
                        const pMatches = detailHtml.match(/<p>([\s\S]+?)<\/p>/gi);
                        if (pMatches) {
                            const pTexts = pMatches.map(p => p.replace(/<[^>]+?>/g, '').trim()).filter(p => p.length > 20);
                            if (pTexts.length > 0) {
                                description = pTexts.slice(0, 4).join("\n\n");
                            }
                        }
                        // Extract list items as eligibility rules
                        const liMatches = detailHtml.match(/<li>([\s\S]+?)<\/li>/gi);
                        if (liMatches) {
                            const liTexts = liMatches.map(li => li.replace(/<[^>]+?>/g, '').trim()).filter(li => li.length > 15);
                            if (liTexts.length > 0) {
                                eligibility = liTexts.slice(0, 5).map(li => "- " + li).join("\n");
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Scraper] Opportunities Circle details fetch error for ${sourceUrl}:`, e);
                }

                const opportunity_doc = {
                    title,
                    description,
                    source: "opportunities_circle",
                    apply_link: sourceUrl,
                    source_url: sourceUrl,
                    source_name: "Opportunities Circle",
                    image_url: imageUrl,
                    tags: cleanTags,
                    category,
                    deadline: deadlineText,
                    eligibility,
                    location,
                    opportunity_type: category.toLowerCase(),
                    created_at: new Date(),
                    updated_at: new Date(),
                    fingerprint: fp,
                    fingerprint_hash: fp,
                    title_hash: titleHash,
                    url_hash: urlHash
                };

                const res = await db.collection("opportunities").updateOne(
                    { fingerprint: fp },
                    { $setOnInsert: opportunity_doc },
                    { upsert: true }
                );

                if (res.upsertedCount > 0) {
                    inserted++;
                }

                // Gracefully pause to avoid rate limit bans
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            console.log(`[Scraper] Opportunities Circle: Page ${page} finished, scraped ${foundInPage} items.`);
            if (foundInPage === 0) break;
        }

        console.log(`[Scraper] Opportunities Circle added ${inserted} items.`);
    } catch(e) {
        console.error("Opportunities Circle scraper failed:", e);
    }

    console.log("[Scraper] Completed collection run.");
  } catch(e) {
    console.error("[Scraper] Error:", e);
  } finally {
    await client.close();
  }
}
