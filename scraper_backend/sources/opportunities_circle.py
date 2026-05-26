import os
import re
import hashlib
import logging
import asyncio
from datetime import datetime
import httpx
from bs4 import BeautifulSoup
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] OpportunitiesCircleScraper: %(message)s"
)
logger = logging.getLogger("OpportunitiesCircleScraper")

load_dotenv()

class OpportunitiesCircleScraper:
    source = "opportunities_circle"
    base_url = "https://www.opportunitiescircle.com"
    explore_url = "https://www.opportunitiescircle.com/explore-opportunities/"
    
    def __init__(self):
        self.uri = os.getenv("MONGODB_URI")
        self.db_name = os.getenv("MONGODB_DB_NAME", "yuvahub")
        self.client = None
        self.db = None
        
        if self.uri:
            self.client = MongoClient(self.uri)
            self.db = self.client[self.db_name]
            self.setup_indexes()
            logger.info(f"Connected to MongoDB database: {self.db_name}")
        else:
            logger.warning("No MONGODB_URI found! Running in mock/dry-run mode.")

    def setup_indexes(self):
        """Creates standard indexes in the opportunities collection."""
        if self.db is not None:
            self.db.opportunities.create_index("deadline")
            self.db.opportunities.create_index("tags")
            self.db.opportunities.create_index("source")
            self.db.opportunities.create_index("created_at")
            self.db.opportunities.create_index("fingerprint_hash", unique=True)
            logger.info("Indexes successfully ensured on Mongo collection 'opportunities'")

    def generate_hashes(self, title: str, source_url: str):
        """
        Generates unique, normalized hashes for deduplication.
        """
        normalized_title = re.sub(r'[^a-z0-9]', '', title.lower().strip())
        title_hash = hashlib.md5(normalized_title.encode()).hexdigest()
        url_hash = hashlib.md5(source_url.strip().lower().encode()).hexdigest()
        
        # Combined fingerprint hash
        raw_fp = f"opportunities_circle:{title_hash}:{url_hash}"
        fingerprint_hash = hashlib.md5(raw_fp.encode()).hexdigest()
        
        return title_hash, url_hash, fingerprint_hash

    async def fetch_page(self, client: httpx.AsyncClient, url: str) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = await client.get(url, headers=headers, timeout=25.0)
        response.raise_for_status()
        return response.text

    async def scrape_detail_page(self, client: httpx.AsyncClient, url: str):
        """
        Visits the individual detail page to extract description, eligibility & location.
        """
        try:
            html = await self.fetch_page(client, url)
            soup = BeautifulSoup(html, "html.parser")
            
            # Find Content Area
            content_div = soup.find(class_=re.compile("theme-post-content|post-content|elementor-posts-container|entry-content"))
            if not content_div:
                content_div = soup.find("article") or soup
                
            paragraphs = content_div.find_all("p")
            clean_paragraphs = [p.get_text().strip() for p in paragraphs if p.get_text().strip()]
            
            # Extract description
            description = "\n\n".join(clean_paragraphs[:4]) if clean_paragraphs else "No description available."
            
            # Try capturing eligibility criteria
            eligibility = ""
            eligibility_header = None
            
            # Match headings containing "Eligibility" or "Criteria"
            for heading in content_div.find_all(["h2", "h3", "h4", "h5", "strong"]):
                text = heading.get_text()
                if re.search(r"Eligibility|Criteria|Eligible", text, re.I):
                    eligibility_header = heading
                    break
                    
            if eligibility_header:
                # Capture list or paragraphs after header
                sibling = eligibility_header.find_next_sibling()
                criteria_list = []
                count = 0
                while sibling and count < 3:
                    if sibling.name in ["ul", "ol"]:
                        criteria_list.extend([li.get_text().strip() for li in sibling.find_all("li") if li.get_text().strip()])
                        break
                    elif sibling.name == "p":
                        criteria_list.append(sibling.get_text().strip())
                    elif sibling.name in ["h2", "h3", "h4", "h5"]:
                        break # reached another heading
                    sibling = sibling.find_next_sibling()
                    count += 1
                eligibility = "\n".join(criteria_list)
                
            if not eligibility:
                # Fallback to search inside all content
                list_items = [li.get_text().strip() for li in content_div.find_all("li") if len(li.get_text().strip()) > 15]
                eligibility = "\n- ".join(list_items[:5]) if list_items else "International students eligible. Check source link for details."
            
            return description, eligibility
        except Exception as e:
            logger.error(f"Failed to scrape detail page {url}: {e}")
            return "Failed to fetch detailed description. See source link.", "See source link for eligibility requirements."

    async def scrape(self, max_pages: int = 5):
        """
        Paginated scraping sequence.
        """
        logger.info(f"Starting Opportunities Circle scraper (max_pages={max_pages})")
        
        inserted_count = 0
        duplicate_hits = 0
        duplicate_threshold = 8 # Stop after 8 duplicate hits to optimize runtime
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(headers=headers, timeout=25.0, follow_redirects=True) as client:
            for page in range(1, max_pages + 1):
                if duplicate_hits >= duplicate_threshold:
                    logger.info("Duplicate threshold reached. Stopping crawling.")
                    break
                    
                # Format URL: page is 1: base page. page > 1: base_url/page/n/ or ?sf_paged=n
                if page == 1:
                    page_url = self.explore_url
                else:
                    page_url = f"{self.explore_url}page/{page}/?sf_paged={page}"
                
                logger.info(f"Crawling Page {page}: {page_url}")
                
                try:
                    html = await self.fetch_page(client, page_url)
                    soup = BeautifulSoup(html, "html.parser")
                    
                    articles = soup.find_all("article")
                    if not articles:
                        logger.info("No more opportunity articles found. Stopping pagination.")
                        break
                    
                    logger.info(f"Found {len(articles)} card articles on page {page}")
                    
                    for index, art in enumerate(articles):
                        if duplicate_hits >= duplicate_threshold:
                            break
                        
                        # Extract Title and Detail Link
                        title_tag = art.find("h3") or art.find("h4") or art.find(class_=re.compile("heading|title"))
                        if not title_tag:
                            continue
                            
                        anchor = title_tag.find("a")
                        if not anchor:
                            anchor = art.find("a")
                            
                        if not anchor or not anchor.get("href"):
                            continue
                            
                        title = anchor.get_text().strip()
                        source_url = anchor.get("href")
                        
                        # Guard against duplicate hashes
                        title_hash, url_hash, f_hash = self.generate_hashes(title, source_url)
                        
                        # Check DB
                        if self.db is not None:
                            exists = self.db.opportunities.find_one({"fingerprint_hash": f_hash})
                            if exists:
                                duplicate_hits += 1
                                logger.info(f"Duplicate found: '{title}' (Hits: {duplicate_hits}/{duplicate_threshold})")
                                continue
                        
                        # Extract Image URL
                        img_tag = art.find("img")
                        image_url = ""
                        if img_tag:
                            image_url = img_tag.get("data-lazy-src") or img_tag.get("src") or ""
                            # Ignore transparent spacer svg
                            if "data:image" in image_url:
                                image_url = img_tag.get("data-lazy-srcset", "").split(" ")[0] or ""
                                if not image_url:
                                    image_url = "https://www.opportunitiescircle.com/wp-content/uploads/2021/04/opportunities-circle-logo.png"

                        # Extract Tags & Tags Class Lists
                        raw_classes = art.get("class", [])
                        tags = []
                        category = "Scholarship"
                        
                        # Find tags and categories from Wordpress post classes
                        for c in raw_classes:
                            if c.startswith("tag-"):
                                tag_name = c.replace("tag-", "").replace("-", " ").title()
                                tags.append(tag_name)
                            if c.startswith("category-"):
                                cat_name = c.replace("category-", "").replace("-", " ").title()
                                if cat_name.lower() in ["scholarships", "scholarship"]:
                                    category = "Scholarship"
                                elif "internship" in cat_name.lower():
                                    category = "Internship"
                                elif "fellowship" in cat_name.lower():
                                    category = "Fellowship"
                                elif "competition" in cat_name.lower() or "award" in cat_name.lower():
                                    category = "Competition"
                                else:
                                    category = cat_name

                        tags = list(set(tags))[:4] or ["Scholarship", "Global Opportunity"]
                        
                        # Extract Deadline (text after Clock icon)
                        deadline = "Check source site"
                        post_info_items = art.find_all(class_=re.compile("post-info|icon-list-item|repeater-item"))
                        for item in post_info_items:
                            if item.find("svg") or "clock" in str(item.get("class")):
                                detail_text = item.get_text().strip()
                                if detail_text:
                                    deadline = detail_text
                                    break
                        
                        logger.info(f"[{index+1}] Scraping details for '{title}'...")
                        description, eligibility = await self.scrape_detail_page(client, source_url)
                        
                        # Determine location (fallback logic from tags)
                        location = "Global"
                        for t in tags:
                            if any(country in t.lower() for country in ["usa", "uk", "australia", "canada", "germany", "japan", "europe"]):
                                location = t
                                break
                        
                        # Standardized Schema Document
                        opportunity_doc = {
                            "title": title,
                            "description": description,
                            "source": self.source,
                            "source_url": source_url,
                            "source_name": "Opportunities Circle",
                            "image_url": image_url or "https://www.opportunitiescircle.com/wp-content/uploads/2021/04/opportunities-circle-logo.png",
                            "tags": tags,
                            "category": category,
                            "deadline": deadline,
                            "eligibility": eligibility,
                            "location": location,
                            "opportunity_type": category.lower(),
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                            "fingerprint": f_hash, # for original validator index compatibility
                            "fingerprint_hash": f_hash, # for specialized duplicate control
                            "title_hash": title_hash,
                            "url_hash": url_hash
                        }
                        
                        if self.db is not None:
                            self.db.opportunities.update_one(
                                {"fingerprint_hash": f_hash},
                                {"$setOnInsert": opportunity_doc},
                                upsert=True
                            )
                            inserted_count += 1
                        else:
                            logger.info(f"[MOCK] Saving: {title}")
                            inserted_count += 1
                            
                        # Avoid aggressive scraping rate-limits (politeness block)
                        await asyncio.sleep(1.0)
                        
                except Exception as e:
                    logger.error(f"Error scraping page {page_url}: {e}")
                    # Allow gracefully continuing other pagination steps without crashing
                    continue

        logger.info(f"Completed collection run. Inserted/Updated {inserted_count} opportunities from Opportunities Circle.")
        return inserted_count

if __name__ == "__main__":
    scraper = OpportunitiesCircleScraper()
    asyncio.run(scraper.scrape(max_pages=2))
