const fs = require('fs');
const path = require('path');

const b64 = fs.readFileSync(path.join(__dirname, '..', 'public', 'logosimbolo.png')).toString('base64');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>onFRU • Integración de Marca y Logosímbolo</title>
    <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #F8FAFC;
            color: #0F172A;
            margin: 0;
            padding: 24px;
        }
        .font-brand {
            font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif;
        }
        .symbol-img {
            object-fit: contain;
        }
    </style>
</head>
<body class="max-w-5xl mx-auto space-y-8">

    <!-- ENCABEZADO -->
    <header class="border-b border-slate-200 pb-6">
        <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2 border border-emerald-200">
                    <span>✦</span> Propuesta de Identidad Digital
                </div>
                <h1 class="text-3xl font-black tracking-tight text-slate-900">
                    Integración del Logosímbolo FruFresco con <span class="text-emerald-700">onFRU</span>
                </h1>
                <p class="text-sm text-slate-600 mt-1">
                    Conservamos el ADN visual del logosímbolo registrado (la 'f' verde con las hojas y la manzana roja) acoplándolo con la nueva tipografía tecnológica.
                </p>
            </div>
            <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs font-bold text-slate-600">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Activo en Base de Datos Supabase
            </div>
        </div>
    </header>

    <!-- PROPUESTAS PRINCIPALES EN GRID -->
    <div class="grid md:grid-cols-2 gap-6">

        <!-- PROPUESTA 1: IMAGOTIPO CANÓNICO (RECOMENDADO) -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between hover:border-emerald-500/50 transition-all">
            <div>
                <div class="flex items-center justify-between mb-4">
                    <span class="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-extrabold text-xs tracking-wider">
                        OPCIÓN 1 (RECOMENDADA)
                    </span>
                    <span class="text-xs text-slate-500 font-medium">Imagotipo Canónico B2B</span>
                </div>
                <h2 class="text-lg font-bold text-slate-900">Símbolo + Logotipo Tipográfico</h2>
                <p class="text-xs text-slate-500 mt-1 mb-6">
                    El logosímbolo icónico se sitúa a la izquierda en escala exacta, seguido del nombre <strong class="text-slate-800">onFRU</strong> con 'on' en gris pizarra y 'FRU' en verde bosque con peso 900.
                </p>

                <!-- CANVAS DE PREVIEW 1 -->
                <div class="bg-slate-50 border border-slate-200/60 rounded-xl p-8 flex items-center justify-center min-h-[140px]">
                    <div class="flex items-center gap-3.5">
                        <div class="w-14 h-14 flex items-center justify-center shrink-0">
                            <img src="data:image/png;base64,${b64}" alt="Logosímbolo FruFresco" class="max-h-full max-w-full symbol-img drop-shadow-sm" />
                        </div>
                        <div class="flex flex-col">
                            <div class="font-brand text-4xl leading-none tracking-tight">
                                <span class="font-medium text-slate-800">on</span><span class="font-black text-emerald-800">FRU</span>
                            </div>
                            <span class="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mt-1 pl-0.5">
                                Operational OS
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>✓ Máxima legibilidad</span>
                <span>✓ Ideal para Navbar y Membretes</span>
            </div>
        </div>

        <!-- PROPUESTA 2: INTEGRACIÓN EMBEBIDA (LA 'F' ES EL SÍMBOLO) -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between hover:border-emerald-500/50 transition-all">
            <div>
                <div class="flex items-center justify-between mb-4">
                    <span class="px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 font-extrabold text-xs tracking-wider">
                        OPCIÓN 2 (CREATIVA)
                    </span>
                    <span class="text-xs text-slate-500 font-medium">Fusión Tipográfica</span>
                </div>
                <h2 class="text-lg font-bold text-slate-900">La 'F' como Logosímbolo</h2>
                <p class="text-xs text-slate-500 mt-1 mb-6">
                    La letra <strong class="text-slate-800">F</strong> de onFRU es sustituida directamente por el logosímbolo de FruFresco, logrando un bloque 100% integrado.
                </p>

                <!-- CANVAS DE PREVIEW 2 -->
                <div class="bg-slate-50 border border-slate-200/60 rounded-xl p-8 flex items-center justify-center min-h-[140px]">
                    <div class="flex items-center gap-1 font-brand text-4xl leading-none">
                        <span class="font-semibold text-slate-800 text-3xl pb-1">on</span>
                        <div class="w-12 h-12 inline-flex items-center justify-center shrink-0 mx-0.5">
                            <img src="data:image/png;base64,${b64}" alt="Logosímbolo FruFresco" class="max-h-full max-w-full symbol-img" />
                        </div>
                        <span class="font-black text-emerald-800 tracking-tight">RU</span>
                    </div>
                </div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>✓ Muy original y lúdico</span>
                <span>✓ Excelente para firma de apps</span>
            </div>
        </div>

    </div>

    <!-- PROPUESTA 3: CÓMO SE VE EN LA NAVBAR EN VIVO -->
    <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
                <span class="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 font-extrabold text-xs tracking-wider uppercase">
                    Simulación en Vivo
                </span>
                <h2 class="text-lg font-bold text-slate-900 mt-2">¿Cómo lucirá en la Barra de Navegación del Sistema?</h2>
            </div>
            <span class="text-xs text-slate-500">Resolución de escritorio (1600px max)</span>
        </div>

        <!-- MOCKUP NAVBAR REAL -->
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-md flex items-center justify-between flex-wrap gap-4 overflow-hidden">
            
            <!-- LOGO INTEGRADO EN NAVBAR -->
            <div class="flex items-center gap-3 cursor-pointer">
                <div class="w-12 h-12 flex items-center justify-center shrink-0">
                    <img src="data:image/png;base64,${b64}" alt="onFRU Logo" class="max-h-full max-w-full symbol-img drop-shadow-sm" />
                </div>
                <div class="flex flex-col">
                    <div class="font-brand text-2xl font-black leading-none">
                        <span class="text-slate-800 font-medium">on</span><span class="text-emerald-800 font-black">FRU</span>
                    </div>
                    <span class="text-[10px] font-bold text-emerald-600 tracking-wider uppercase mt-0.5">
                        Plataforma de Abastecimiento
                    </span>
                </div>

                <!-- BADGE DE VERSIÓN -->
                <div class="ml-4 hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>V150BEB • ONLINE</span>
                </div>
            </div>

            <!-- ENLACES DE MENÚ SIMULADOS -->
            <div class="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-700">
                <span class="text-emerald-700 font-bold border-b-2 border-emerald-700 pb-1">Inicio</span>
                <span class="hover:text-emerald-700 transition-colors">Catálogo</span>
                <span class="hover:text-emerald-700 transition-colors">Balance Diario</span>
                <span class="hover:text-emerald-700 transition-colors">Operaciones</span>
            </div>

            <!-- PERFIL SIMULADO -->
            <div class="flex items-center gap-3">
                <div class="text-right hidden sm:block">
                    <div class="text-xs font-bold text-slate-800">Investments Cortés</div>
                    <div class="text-[11px] text-slate-600">Jefatura Inventario</div>
                </div>
                <div class="w-9 h-9 rounded-full bg-emerald-800 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                    IC
                </div>
            </div>
        </div>
    </div>

    <!-- MODO OSCURO / CONTRASTE INDUSTRIAL -->
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-white shadow-lg">
        <div class="flex items-center justify-between mb-4">
            <span class="px-2.5 py-1 rounded-md bg-slate-800 text-emerald-400 font-extrabold text-xs tracking-wider uppercase border border-slate-700">
                Modo Oscuro & Contraste Nocturno (Bodega)
            </span>
            <span class="text-xs text-slate-400">Terminales de Piso & Tablets de Muelle</span>
        </div>

        <div class="grid md:grid-cols-2 gap-6 items-center">
            <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-6 flex items-center justify-center">
                <div class="flex items-center gap-3.5">
                    <div class="w-14 h-14 flex items-center justify-center shrink-0">
                        <img src="data:image/png;base64,${b64}" alt="Logosímbolo" class="max-h-full max-w-full symbol-img drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]" />
                    </div>
                    <div class="flex flex-col">
                        <div class="font-brand text-4xl leading-none tracking-tight">
                            <span class="font-medium text-white">on</span><span class="font-black text-emerald-400">FRU</span>
                        </div>
                        <span class="text-[11px] font-bold text-slate-400 tracking-[0.2em] uppercase mt-1">
                            Torre de Control
                        </span>
                    </div>
                </div>
            </div>

            <div class="space-y-3 text-xs text-slate-300">
                <div class="flex items-start gap-2">
                    <span class="text-emerald-400 font-bold">✓</span>
                    <span><strong>Manzana roja y hojas verdes:</strong> Destacan con altísimo contraste sobre fondo oscuro (<code>#0F172A</code>), ideal para las pantallas de despacho a las 4:00 AM.</span>
                </div>
                <div class="flex items-start gap-2">
                    <span class="text-emerald-400 font-bold">✓</span>
                    <span><strong>Fidelidad de Marca:</strong> No requiere modificar la imagen registrada en la base de datos de Supabase, solo acoplar la tipografía contigua.</span>
                </div>
                <div class="flex items-start gap-2">
                    <span class="text-emerald-400 font-bold">✓</span>
                    <span><strong>Cero Pérdida de Historia:</strong> La razón social legal (Investments Cortés) se conserva intacta en el pie de página y facturación.</span>
                </div>
            </div>
        </div>
    </div>

</body>
</html>`;

const outPath = path.join('C:', 'Users', 'German Higuera', '.gemini', 'antigravity', 'brain', '11b3936e-3ed6-4604-bf9d-0abab5f3495a', 'onfru_branding_showcase.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Artifact written to:', outPath);
