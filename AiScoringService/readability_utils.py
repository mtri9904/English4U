import re
import textstat
import wordfreq

# Academic Word List (AWL) - 570 core academic word families (lemmas and sublists)
AWL_WORDS = {
    "analyse", "approach", "area", "assess", "assume", "authority", "available", "benefit", "concept", "consistent",
    "constitutional", "context", "contract", "create", "data", "definition", "derived", "distribution", "economic",
    "environment", "established", "estimate", "evidence", "export", "factors", "financial", "formula", "function",
    "identified", "income", "indicate", "individual", "interpretation", "involved", "issues", "labour", "legal",
    "legislation", "major", "method", "occur", "percent", "period", "policy", "principle", "procedure", "process",
    "required", "research", "response", "role", "section", "sector", "significant", "similar", "source", "specific",
    "structure", "theory", "variables", "achieve", "acquisition", "administration", "affect", "appropriate", "aspects",
    "assistance", "category", "chapter", "commission", "community", "complex", "computer", "conclusion", "conduct",
    "consequences", "construction", "consumer", "credit", "cultural", "design", "distinction", "elements", "equation",
    "evaluation", "features", "final", "focus", "impact", "injury", "institute", "investment", "journal", "maintenance",
    "normal", "obtained", "participation", "perceived", "positive", "potential", "previous", "primary", "purchase",
    "range", "region", "regulation", "relevant", "required", "resources", "restricted", "security", "seek", "select",
    "site", "strategies", "survey", "text", "traditional", "transfer", "alternative", "circumstances", "comments",
    "compensation", "components", "consent", "considerable", "constant", "constraints", "contribution", "convention",
    "coordination", "core", "corporate", "corresponding", "criteria", "deduction", "demonstrate", "document", "dominant",
    "emphasis", "ensure", "excluded", "framework", "funds", "illustrated", "immigration", "implies", "initial",
    "instance", "interaction", "justification", "layer", "link", "location", "maximum", "minorities", "outcome",
    "partnership", "philosophy", "physical", "proportion", "published", "reaction", "registered", "reliance", "removed",
    "scheme", "sequence", "sex", "shift", "sufficient", "task", "technical", "techniques", "technology", "valid",
    "volume", "access", "adequate", "annual", "apparent", "approximated", "attitudes", "attributed", "civil",
    "code", "commitment", "communication", "concentration", "conference", "contrast", "cycle", "debate", "despite",
    "dimension", "domestic", "emerged", "error", "ethnic", "goals", "granted", "hence", "hypothesis", "implementation",
    "implications", "imposed", "integration", "internal", "investigation", "job", "label", "mechanism", "obvious",
    "occupational", "option", "output", "overall", "parallel", "parameters", "phase", "predict", "principal", "prior",
    "professional", "project", "promotion", "regime", "resolution", "retained", "series", "statistics", "status",
    "stress", "subsequent", "sum", "summary", "undertaken", "academic", "adjustment", "alter", "amendment", "aware",
    "capacity", "challenge", "clause", "compounds", "conflict", "consultation", "contact", "decline", "discretion",
    "draft", "enable", "energy", "enforcement", "entities", "equivalent", "evolution", "expansion", "exposure",
    "external", "facilitate", "fundamental", "generated", "generation", "image", "liberal", "licence", "logic",
    "marginal", "medical", "mental", "modified", "monitoring", "network", "notion", "objective", "orientation",
    "perspective", "precise", "prime", "psychology", "pursue", "ratio", "rejected", "revenue", "stability", "styles",
    "substitution", "sustainable", "symbolic", "target", "transition", "trend", "version", "welfare", "whereas",
    "abstract", "accurate", "acknowledged", "aggregate", "allocation", "assignment", "attached", "author", "bond",
    "brief", "capable", "cited", "cooperative", "discrimination", "diversity", "domain", "edition", "enhanced",
    "estate", "exceed", "explicit", "federal", "fees", "flexibility", "furthermore", "gender", "ignored", "incentive",
    "incidence", "incorporated", "index", "inhibition", "initiatives", "input", "instructions", "intelligence",
    "interval", "lecture", "migration", "minimum", "ministry", "motivation", "neutral", "nevertheless", "overseas",
    "preceding", "presumption", "rational", "recovery", "refined", "regulations", "rejected", "reveal", "scope",
    "subsidiary", "tape", "trace", "transformation", "transport", "underlying", "utility", "adaptation", "advocate",
    "channel", "classical", "contrary", "conversion", "decade", "definite", "deny", "disposal", "dynamic", "equipped",
    "empirical", "evaluation", "file", "finite", "foundation", "global", "grade", "guarantee", "hierarchical",
    "identical", "ideology", "inferred", "innovation", "insert", "intervention", "isolated", "media", "mode",
    "networks", "obtain", "paradigm", "phenomenon", "priority", "prohibited", "publication", "quotation", "release",
    "reverse", "simulation", "solely", "somewhat", "submitted", "successor", "survival", "thesis", "topic",
    "transmission", "ultimate", "unique", "visible", "abandon", "accompanied", "accumulation", "analogous", "annual",
    "anticipate", "assurance", "attained", "bulk", "coherence", "coincide", "compatible", "concurrent", "confined",
    "controversy", "conversely", "device", "devoted", "diminished", "distortion", "duration", "erosion", "ethical",
    "format", "founded", "inherent", "insights", "integral", "intensity", "interactive", "intermediate", "isolated",
    "manual", "mature", "mediation", "military", "minimal", "mutual", "norms", "overlap", "passive", "portion",
    "preliminary", "protocol", "qualitative", "refine", "relaxed", "revolution", "rigid", "route", "scenario",
    "sphere", "subordinate", "supplementy", "suspended", "team", "temporary", "trigger", "unified", "violation",
    "vision", "agreement", "assembly", "barrier", "behalf", "bulk", "candidate", "capabilities", "channel",
    "clinically", "coherent", "coincide", "colleagues", "combined", "compatible", "components", "compound",
    "comprehensive", "comprise", "concede", "conceive", "concurrent", "conduct", "confined", "conflict", "confront",
    "consent", "consequent", "considerable", "consistency", "constant", "constrain", "construct", "consult",
    "consume", "contact", "contemporary", "context", "contract", "contradict", "contrary", "contrast", "contribute",
    "controversial", "controversy", "convene", "convention", "conversely", "convert", "convince", "cooperate",
    "coordinate", "core", "corporate", "correspond", "credibility", "credit", "criteria", "critical", "crucial",
    "culture", "currency", "cycle"
}


def clean_words(text: str) -> list[str]:
    """Tokenize and clean words from text."""
    words = re.findall(r"\b[a-zA-Z']+\b", text.lower())
    return [w for w in words if len(w) > 0]


def calculate_awl_ratio(words: list[str]) -> float:
    """Calculate the percentage of words belonging to the AWL."""
    if not words:
        return 0.0
    awl_count = sum(1 for w in words if w in AWL_WORDS)
    return round((awl_count / len(words)) * 100.0, 2)


def calculate_average_zipf(words: list[str]) -> float:
    """Calculate the average Zipf frequency of words in the text."""
    if not words:
        return 0.0
    # Filter out stopwords or highly common short words to avoid skewing if desired,
    # but for a standard overall corpus measure, a simple average of all valid English words is standard.
    zipf_scores = []
    for w in words:
        freq = wordfreq.zipf_frequency(w, 'en')
        if freq > 0:
            zipf_scores.append(freq)
    
    if not zipf_scores:
        return 0.0
    return round(sum(zipf_scores) / len(zipf_scores), 2)


def analyze_text_readability(text: str) -> dict:
    """Run full readability analysis on raw text."""
    cleaned = text.strip()
    words = clean_words(cleaned)
    
    # Calculate readability metrics
    fk_grade = textstat.flesch_kincaid_grade(cleaned)
    gunning_fog = textstat.gunning_fog(cleaned)
    word_count = len(words)
    
    # Calculate lexical metrics
    zipf_freq = calculate_average_zipf(words)
    awl_ratio = calculate_awl_ratio(words)
    
    return {
        "flesch_kincaid_grade": round(fk_grade, 2),
        "gunning_fog": round(gunning_fog, 2),
        "word_count": word_count,
        "zipf_frequency": zipf_freq,
        "awl_ratio": awl_ratio
    }
