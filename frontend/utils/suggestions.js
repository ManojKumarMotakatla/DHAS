// ============================================
// DHAS - suggestions.js
// Diet & remedy suggestions per condition
// ============================================

const suggestions = {
    covid_like: {
        diet: {
            eat:   ["Warm turmeric milk", "High protein foods (dal, eggs, paneer)", "Fresh fruits", "Giloy / Ashwagandha tea", "Zinc-rich foods (pumpkin seeds, chickpeas)"],
            avoid: ["Cold and raw foods", "Alcohol", "Junk food", "Excess sugar"]
        },
        remedies: [
            "Drink Kadha (tulsi, ginger, black pepper, cloves)",
            "Steam inhalation twice daily",
            "Monitor oxygen with pulse oximeter",
            "Isolate yourself and wear a mask",
            "Take complete rest and stay hydrated"
        ]
    },
    flu: {
        diet: {
            eat:   ["Warm vegetable soup", "Oranges and citrus fruits", "Ginger tea with honey", "Light khichdi", "Bananas"],
            avoid: ["Junk food", "Cold drinks", "Oily / fried foods", "Spicy food", "Alcohol"]
        },
        remedies: [
            "Drink warm ginger tea with honey twice a day",
            "Steam inhalation with eucalyptus oil",
            "Rest and sleep at least 8 hours",
            "Gargle with warm salt water",
            "Take Vitamin C (orange juice, amla)"
        ]
    },
    viral_fever: {
        diet: {
            eat:   ["Warm water and herbal teas", "Papaya, pomegranate", "Light rice porridge", "Coconut water", "Honey"],
            avoid: ["Oily food", "Cold items", "Spicy curries", "Junk food"]
        },
        remedies: [
            "Apply cool damp cloth on forehead",
            "Drink tulsi + black pepper + ginger decoction",
            "Take complete bed rest",
            "Drink 2–3 liters of water daily",
            "Sponge bath with lukewarm water if fever is high"
        ]
    },
    common_cold: {
        diet: {
            eat:   ["Warm soups", "Tulsi tea", "Ginger-honey milk", "Garlic in food", "Vitamin C fruits"],
            avoid: ["Cold water", "Ice cream", "Fried snacks", "Excess sugar"]
        },
        remedies: [
            "Steam inhalation 2–3 times a day",
            "Drink turmeric milk at night",
            "Ginger + honey + lemon in warm water",
            "Keep your nose and head warm",
            "Use saline nasal drops for relief"
        ]
    },
    gastro: {
        diet: {
            eat:   ["ORS solution", "Banana", "Plain boiled rice", "Toast / rusk", "Curd (probiotic)", "Coconut water"],
            avoid: ["Oily food", "Spicy food", "Raw vegetables", "Caffeinated drinks", "Junk food"]
        },
        remedies: [
            "Drink ORS to prevent dehydration",
            "Sip small amounts of water frequently",
            "Eat BRAT diet (Banana, Rice, Apple, Toast)",
            "Avoid solid food for a few hours if vomiting",
            "Rest and avoid physical activity"
        ]
    },
    headache: {
        diet: {
            eat:   ["Plenty of water", "Banana", "Almonds and walnuts", "Spinach", "Ginger tea", "Watermelon"],
            avoid: ["Caffeine excess", "Alcohol", "Processed meats", "Too much salt", "Skipping meals"]
        },
        remedies: [
            "Massage temples with peppermint oil",
            "Drink a large glass of water",
            "Apply cold compress on forehead",
            "Rest in a dark quiet room",
            "Practice deep breathing or meditation"
        ]
    },
    general: {
        diet: {
            eat:   ["Fresh fruits", "Vegetable soup", "Warm water", "Light dal-rice", "Curd", "Green vegetables"],
            avoid: ["Junk food", "Oily food", "Cold drinks", "Spicy food", "Alcohol"]
        },
        remedies: [
            "Drink warm water regularly",
            "Take proper rest (7–8 hours sleep)",
            "Do steam inhalation for cold/cough",
            "Use turmeric milk at night",
            "Eat light and easy to digest meals"
        ]
    }
};

function getSuggestions(conditionKey) {
    return suggestions[conditionKey] || suggestions["general"];
}

module.exports = { getSuggestions };