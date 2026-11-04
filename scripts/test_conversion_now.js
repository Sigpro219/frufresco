const { formatStructuredSpecification } = require("../src/lib/orderUtils");

// In orderUtils.ts or alistamiento-print/page.tsx:
const itemBatea = {
  id: "a7a63320-bce3-48ea-b37c-bb1be50ee143",
  order_id: "2b2b504b-c68c-4b9a-9f40-9fd03bb7de34",
  product_id: "64aa9752-999a-44ed-bf06-58f739d81fda",
  quantity: 2.5, // wait, what was quantity? Let's check what quantity was in DB or if it was 2.5 or 1.25
  unit: "Kg",
  nickname: "und de 500 gr",
  variant_label: "und de 500 gr",
  selected_options: {
    "Presentación": "Unidad 500 gr"
  }
};
