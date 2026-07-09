const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const excelTextContext = `
--- HOJA: Hoja1 ---
["OPERACIÓN","CLUB BELLAVISTA ",7900405437]
["PLU","PRODUCTO",null,"robles","capitanes","pinos","eventos","personal","nogales",195,"OBSERVACIONES"]
[1402443,"ACELGA BABY INSTITUCIONAL X 1000 G",0]
[194599,"ACELGA INSTITUCIONAL 1000 G",0]
[1403147,"ACHIOTE INSTITUCIONAL X 1000 G",0]
[1029817,"ACHIOTE EN PEPA KG",0]
[733012,"AGRAZ INSTITUCIONAL 1000G",1,null,null,null,1]
[33,"AGUACATE EXTRA INSTITUCIONAL 1000 G",0]
[62,"AGUACATE PRIMERA INSTITUCIONAL 1000 G",110,null,null,20,50,null,40,null,"50 maduro el resto pinton"]
[1402299,"AHUYAMA CANDELARIA INST. X 1000 GR",0]
[646563,"AHUYAMA INSTITUCIONAL 1000 G",0]
[1420198,"AJI CHILE ANCHO INST. X 1000 GR",0]
[1420201,"AJI CHILE ARBOL INST. X 1000 GR",0]
`;

const excelPrompt = `
Eres un asistente de logística experto en digitalización de pedidos para FruFresco.
FECHA ACTUAL DEL SISTEMA: 2026-06-23

CONTEXTO ADICIONAL (Texto del cuerpo del correo enviado por el cliente):
""

CONTENIDO DEL ARCHIVO ADJUNTO EXCEL/CSV:
${excelTextContext}

TAREA:
1. Analiza el contenido de texto del archivo Excel adjunto para extraer la lista de productos solicitados.
2. Identifica el nombre o empresa del CLIENTE, dirección de entrega física, número de teléfono, cédula/NIT y jornada preferida de entrega combinando el análisis del correo y del Excel.
    - NOMBRE DEL CLIENTE: Identifica la compañía matriz o razón social principal. NUNCA uses nombres de sucursales o ciudades.
3. Identifica la franja u horario de entrega. El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
4. Clasifica el tipo de cliente en "clientType": "b2b_client" o "b2c_client".
5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD" usando la fecha actual del sistema como referencia.
6. Extrae todos los productos solicitados y su cantidad numérica.
      - Identifica dinámicamente qué columna contiene la "CANTIDAD PEDIDA" o "CANTIDAD TOTAL". No asumas que siempre es la tercera columna.
      - Si la cabecera (título) de la columna de cantidades está vacía o es nula en el documento/tabla, pero claramente contiene los valores totales numéricos del pedido, asume que esa es la columna correcta y extrae las cantidades de ahí.
      - Evita extraer Códigos de Barras o códigos PLU como si fueran cantidades.
      - Si la tabla incluye una columna de CANTIDAD TOTAL y luego columnas adicionales que desglosan esa cantidad por sedes, usa ÚNICAMENTE la CANTIDAD TOTAL. Ignora los desgloses para no duplicar las cantidades.
      - Asegúrate de extraer la cantidad pedida correcta que aparece junto al nombre del producto.
      - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
7. Extrae las observaciones o especificaciones en el campo "observations".

REGLAS CRÍTICAS:
- Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
- Las cantidades deben ser estrictamente numéricas.

FORMATO DE RESPUESTA ESPERADO:
{
  "clientInDocument": "Nombre o Empresa Detectada",
  "documentType": "Email con Excel adjunto",
  "address": "Dirección física limpia extraída o vacio",
  "phone": "Teléfono extraído o vacio",
  "nit": "NIT o cédula extraída o vacio",
  "deliverySlot": "AM / PM / Cualquier hora / null",
  "deliveryDate": "YYYY-MM-DD o null",
  "clientType": "b2b_client o b2c_client",
  "items": [
    { "originalName": "Nombre del Producto", "quantity": 10, "observations": "Cualquier nota u observación específica del producto o null" }
  ]
}
`;

async function testGemini() {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(excelPrompt);
  console.log(result.response.text());
}

testGemini();
