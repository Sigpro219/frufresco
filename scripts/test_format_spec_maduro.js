const { formatStructuredSpecification } = require("../src/lib/orderUtils");

const itemColsubsidio = {
  product_name: "Aguacate",
  quantity: 20,
  unit: "Kg",
  nickname: "AGUACATE PAPELILLO 1000 GR (papelillo 1000 gr)",
  selected_options: {
    "Maduración": "Maduro",
    "Presentación": "Kg"
  }
};

const note = formatStructuredSpecification(itemColsubsidio);
console.log("formatStructuredSpecification output for Colsubsidio:", note);

const itemPinton = {
  product_name: "Aguacate",
  quantity: 20,
  unit: "Kg",
  selected_options: {
    "Maduración": "Pintón",
    "Presentación": "Kg"
  }
};
console.log("formatStructuredSpecification output for Pintón:", formatStructuredSpecification(itemPinton));
