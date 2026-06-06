"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from '@/lib/supabase';
import { useAuth } from "../../../lib/authContext";
import { isAbortError, diagnoseStorageError } from "@/lib/errorUtils";
import { REVERSE_CATEGORY_MAP, DEFAULT_CUTOFF_HOUR } from '@/lib/constants';
import confetti from "canvas-confetti";
import { 
  Calendar, 
  BookOpen, 
  List, 
  RefreshCw, 
  Search, 
  Camera, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle,
  ShoppingCart,
  User,
  Clock,
  HelpCircle,
  Pencil
} from 'lucide-react';

interface ProcurementTask {
  id: string;
  product_name: string;
  total_requested: number;
  total_purchased: number;
  unit: string;
  status: "pending" | "partial" | "completed";
  category: string;
  product_id: string;
  variant_label?: string;
  delivery_date?: string;
  original_product_id?: string;
  created_at?: string;
  parent_id?: string;
  parent_name?: string;
  min_inventory_level?: number;
  raw_order_qty?: number;
  applied_stock?: number;
  meta_neteo?: number;
  hasRejection?: boolean;
  hasDeficit?: boolean;
  hasWarning?: boolean;
}

export default function ProcurementPage() {
  console.log("ProcurementPage rendering...");
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<ProcurementTask[]>([]);
  const [taskPurchases, setTaskPurchases] = useState<any[]>([]);
  const [novelties, setNovelties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ProcurementTask | null>(
    null,
  );
  const [providers, setProviders] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showFilterGrid, setShowFilterGrid] = useState(false);
  const [conversions, setConversions] = useState<any[]>([]);

  // Onboarding Guide States
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  // Substitution states
  const [isSubstituting, setIsSubstituting] = useState(false);
  const [isReprogramming, setIsReprogramming] = useState(false);
  const [searchSub, setSearchSub] = useState("");
  const [subResults, setSubResults] = useState<any[]>([]);

  // Form states
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providerSearchText, setProviderSearchText] = useState("");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);

  useEffect(() => {
    if (selectedProvider) {
      const prov = providers.find(p => p.id === selectedProvider);
      if (prov) {
        setProviderSearchText(`${prov.product ? prov.product.toUpperCase() : "PRODUCTO"} - ${prov.name}`);
        if (prov.warehouse_location || prov.puesto) {
          const parts = [];
          if (prov.warehouse_location) parts.push(`Bodega: ${prov.warehouse_location}`);
          if (prov.puesto) parts.push(`Puesto: ${prov.puesto}`);
          setLocation(parts.join(", "));
          
          setContingencyBodega(prov.warehouse_location ? String(prov.warehouse_location) : "");
          setContingencyPuesto(prov.puesto ? String(prov.puesto) : "");
        } else if (prov.location) {
          setLocation(prov.location);
          setContingencyBodega("");
          setContingencyPuesto("");
        } else {
          setLocation("");
          setContingencyBodega("");
          setContingencyPuesto("");
        }
      }
    } else {
      setProviderSearchText("");
      setLocation("");
    }
  }, [selectedProvider, providers]);

  const [location, setLocation] = useState("");
  const [showLocationContingency, setShowLocationContingency] = useState(false);
  const [contingencyBodega, setContingencyBodega] = useState("");
  const [contingencyPuesto, setContingencyPuesto] = useState("");
  const [availableBodegas, setAvailableBodegas] = useState<string[]>([]);
  const [availablePuestos, setAvailablePuestos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Quick Provider states
  const [isQuickProvider, setIsQuickProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderLoc, setNewProviderLoc] = useState("");
  const [newProviderTaxId, setNewProviderTaxId] = useState("");
  const [newProviderPhone, setNewProviderPhone] = useState("");
  const [newProviderEmail, setNewProviderEmail] = useState("");

  // Logistics states
  const [purchaseUnit, setPurchaseUnit] = useState("Kg");
  const [pickupTimeMinutes, setPickupTimeMinutes] = useState<number | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [targetDateLabel, setTargetDateLabel] = useState("");
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    const signal = controller.signal;

    if (profile?.specialty) {
      setFilterCategory(profile.specialty);
    }

    const initLoad = async () => {
      setLoading(true);
      setIsConsolidating(true);
      try {
        await runConsolidation(signal);
      } catch (err) {
        if (!isAbortError(err)) {
          console.error("Auto consolidation failed:", err);
        }
      } finally {
        if (isMounted.current && !signal.aborted) {
          setIsConsolidating(false);
          await Promise.all([
            fetchTasks(signal, profile?.specialty || ""),
            fetchProviders(signal),
            fetchConversions(signal)
          ]);
        }
      }
    };

    initLoad();

    return () => {
      isMounted.current = false;
      controller.abort();
    };
  }, [profile]);

  const resolvePurchaseNovelty = async (p: any, action: string) => {
    try {
      // Only mark existing novelties as resolved — never create new ones here.
      // New novelties are created in recogida/page.tsx when the pickup is rejected.
      const { error: updErr } = await supabase
        .from('provider_novelties')
        .update({
          resolved: true,
          resolution_action: action,
          resolved_at: new Date().toISOString()
        })
        .eq('task_id', p.task_id || selectedTask?.id)
        .eq('resolved', false);

      if (updErr) {
        console.error("Error resolving novelty:", updErr);
      }
    } catch (e) {
      console.error("resolvePurchaseNovelty error:", e);
    }
  };

  const fetchConversions = async (signal?: AbortSignal) => {
    try {
      const { data, error } = await supabase
        .from("product_conversions")
        .select("*")
        .abortSignal(signal as any);

      if (error) {
        if (isAbortError(error)) return;
        console.error("Error loading conversions:", error);
      } else if (isMounted.current) setConversions(data || []);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("Exception in fetchConversions:", err);
    }
  };

  // Lógica de Jornada de Compra (Corte: 6:00 PM)
  // El comprador inicia turno a las 6:00 PM (18:00).
  // En ese momento, comienza a gestionar los pedidos para el DÍA SIGUIENTE.
  // Esta vista debe mantenerse fija hasta el próximo corte (18:00 del día siguiente).
  // - Hora >= 18:00 (6 PM) -> Objetivo: MAÑANA.
  // - Hora < 18:00 (Antes de 6 PM) -> Objetivo: HOY (seguimos viendo lo de ayer a las 6pm).
  const getTargetDeliveryDate = async (signal?: AbortSignal) => {
    try {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "enable_cutoff_rules")
        .abortSignal(signal as any)
        .single();

      const cutoffEnabled = settings?.value !== "false";

      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }),
      );

      // If rules are disabled, we return TODAY so it usually matches the header, 
      // but the fetch logic will ignore it.
      if (!cutoffEnabled) {
        return now.toISOString().split("T")[0];
      }

      const currentHour = now.getHours();

      if (currentHour >= DEFAULT_CUTOFF_HOUR) {
        // After 5 PM, start tomorrow's operation
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        return tomorrow.toISOString().split("T")[0];
      } else {
        // Before 5 PM, keep working today's operation
        return now.toISOString().split("T")[0];
      }
    } catch (e) {
      if (isAbortError(e)) return "";
      console.error("Error reading cutoff settings", e);
      const now = new Date();
      return now.toISOString().split("T")[0];
    }
  };

  const formatDateFriendly = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(`${dateStr}T12:00:00`); // Force mid-day to avoid TZ shifts
    const dayName = date.toLocaleDateString("es-ES", { weekday: "long" });
    const day = date.getDate();
    const month = date.toLocaleDateString("es-ES", { month: "short" });
    // Capitalize first letter
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} ${month}`;
  };

  const fetchTasks = async (signal?: AbortSignal, categoryFilter?: string) => {
    setLoading(true);
    const targetDate = await getTargetDeliveryDate(signal);
    if (!targetDate) {
      if (isMounted.current && !signal?.aborted) setLoading(false);
      return;
    }

    if (isMounted.current) setTargetDateLabel(targetDate);

    try {
      // Check rules again for fetch
      const { data: cutoffData } = await supabase.from('app_settings').select('value').eq('key', 'enable_cutoff_rules').single();
      const cutoffEnabled = cutoffData?.value !== 'false';

      // 1. Load tasks
      let query = supabase.from("procurement_tasks")
        .select("*")
        .eq('delivery_date', targetDate);

      const { data: rawTasks, error: tErr } = await query
        .order("delivery_date", { ascending: true })
        .order("created_at", { ascending: false })
        .abortSignal(signal as any);

      if (tErr) throw tErr;

      if (rawTasks && rawTasks.length > 0) {
        const rawTaskIds = rawTasks.map(t => t.id);
        const productIds = Array.from(new Set(rawTasks.map(t => t.product_id)));

        // 2. Fetch products details (including parent_id, min_inventory_level)
        const { data: products, error: pErr } = await supabase
          .from("products")
          .select("id, name, parent_id, min_inventory_level, category, purchase_sublist, unit_of_measure")
          .in("id", productIds);

        if (pErr) console.warn("No se pudieron cargar detalles de productos", pErr);

        const productMap = (products || []).reduce((acc: any, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});

        // Fetch parent names if they have parent_id
        const parentIds = Array.from(new Set((products || []).map(p => p.parent_id).filter(Boolean)));
        let parentMap: Record<string, string> = {};
        if (parentIds.length > 0) {
          const { data: parentProducts } = await supabase
            .from("products")
            .select("id, name")
            .in("id", parentIds);
          (parentProducts || []).forEach(p => {
            parentMap[p.id] = p.name;
          });
        }

        // 3. Fetch available stocks
        const { data: stocksData } = await supabase
          .from("inventory_stocks")
          .select("product_id, quantity")
          .eq("status", "available");

        const stockMap: Record<string, number> = {};
        (stocksData || []).forEach(s => {
          const q = parseFloat(s.quantity as any) || 0;
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + q;
        });

        // 4. Fetch task purchases
        const { data: purchasesData } = await supabase
          .from("purchases")
          .select(`
            *,
            provider:providers (
              name
            )
          `)
          .in("task_id", rawTaskIds);

        const currentPurchases = purchasesData || [];
        setTaskPurchases(currentPurchases);

        // 5. Fetch unresolved provider novelties
        const { data: noveltiesData } = await supabase
          .from("provider_novelties")
          .select("*")
          .eq("resolved", false);

        // Filter out duplicate submissions (same task, purchase, type, and reason)
        const unresolvedNovelties = (noveltiesData || []).filter((v, i, a) => 
          a.findIndex((t: any) => (t.task_id === v.task_id && t.purchase_id === v.purchase_id && t.novelty_type === v.novelty_type && t.reason === v.reason)) === i
        );
        setNovelties(unresolvedNovelties);

        // Map raw tasks to tasks with details
        let formatted: ProcurementTask[] = rawTasks.map((t: any) => {
          const prod = productMap[t.product_id];
          const pName = prod?.parent_id ? (parentMap[prod.parent_id] || prod.name) : (prod?.name || "");
          let name = prod?.name || `Producto #${t.product_id.split("-")[0]}`;
          if (t.variant_label) {
            name = `${name} (${t.variant_label})`;
          }

          // Cross novelties
          const taskNovs = unresolvedNovelties.filter(n => n.task_id === t.id);
          const hasRejection = taskNovs.some(n => n.novelty_type === 'rejection');
          const hasDeficit = taskNovs.some(n => n.novelty_type === 'deficit');
          const hasWarning = taskNovs.some(n => n.novelty_type === 'warning');

          return {
            id: t.id,
            product_id: t.product_id,
            product_name: name,
            variant_label: t.variant_label,
            total_requested: t.total_requested,
            total_purchased: t.total_purchased,
            unit: prod?.unit_of_measure || t.unit || "kg",
            status: t.status,
            category: prod?.purchase_sublist || "S/N",
            delivery_date: t.delivery_date,
            created_at: t.created_at,
            parent_id: prod?.parent_id || undefined,
            parent_name: pName || undefined,
            min_inventory_level: prod?.min_inventory_level ? parseFloat(prod.min_inventory_level) : 0,
            hasRejection,
            hasDeficit,
            hasWarning,
            // placeholders to be computed in netting
            raw_order_qty: t.total_requested,
            applied_stock: 0,
            meta_neteo: t.total_requested
          };
        });

        // 6. Apply Netting Logic (Model A and Model B combined)
        // Group tasks by base product (parent_id if exists, otherwise product_id)
        const groups: Record<string, ProcurementTask[]> = {};
        formatted.forEach(t => {
          const baseKey = t.parent_id || t.product_id;
          if (!groups[baseKey]) groups[baseKey] = [];
          groups[baseKey].push(t);
        });

        Object.keys(groups).forEach(baseKey => {
          const groupTasks = groups[baseKey];
          // Sort group: base product task first (empty variant label), then variant tasks alphabetically
          groupTasks.sort((a, b) => {
            const labelA = a.variant_label || "";
            const labelB = b.variant_label || "";
            if (labelA === "" && labelB !== "") return -1;
            if (labelA !== "" && labelB === "") return 1;
            return labelA.localeCompare(labelB);
          });

          // Calculate sequential netting
          // Total stock for this base product key is sum of stocks of itself and its variants (or just itself)
          // To be safe, we check stockMap for all product_ids represented in the groupTasks
          let totalGroupStock = 0;
          const processedProductIds = new Set<string>();
          groupTasks.forEach(gt => {
            if (!processedProductIds.has(gt.product_id)) {
              totalGroupStock += stockMap[gt.product_id] || 0;
              processedProductIds.add(gt.product_id);
            }
          });

          let remainingStock = totalGroupStock;
          groupTasks.forEach((gt, idx) => {
            const pedido = gt.total_requested;
            // Safety stock: only add to the first item of the sequence
            const safety = (idx === 0) ? (gt.min_inventory_level || 0) : 0;
            const appliedStock = Math.min(remainingStock, pedido + safety);
            remainingStock -= appliedStock;
            const meta = Math.max(0, pedido - appliedStock + safety);

            gt.applied_stock = appliedStock;
            gt.meta_neteo = meta;
          });
        });

        // 7. Filter Category
        const finalCategory = categoryFilter !== undefined ? categoryFilter : filterCategory;
        if (finalCategory && finalCategory !== "Ver Todo" && finalCategory !== "") {
          formatted = formatted.filter(t => t.category === finalCategory);
        }

        // 8. Sorting by Alert Severity (🔴 > 🟠 > 🟡 > partial > pending > completed)
        formatted.sort((a, b) => {
          // Status order priority
          const getTaskSeverity = (t: ProcurementTask): number => {
            if (t.hasRejection) return 0; // Red (highest)
            if (t.hasDeficit) return 1;    // Orange
            if (t.hasWarning) return 2;    // Yellow
            if (t.status === "partial") return 3;
            if (t.status === "pending") return 4;
            return 5; // Completed (lowest)
          };

          const sevA = getTaskSeverity(a);
          const sevB = getTaskSeverity(b);

          if (sevA !== sevB) return sevA - sevB;

          // Date Tiebreaker
          const dateA = a.delivery_date || "9999-99-99";
          const dateB = b.delivery_date || "9999-99-99";
          return dateA.localeCompare(dateB);
        });

        if (isMounted.current && !signal?.aborted) {
          setTasks(formatted);
          setLoading(false);
        }
      } else {
        if (isMounted.current && !signal?.aborted) {
          setTasks([]);
          setTaskPurchases([]);
          setNovelties([]);
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      console.error("Error en fetchTasks:", err);
      alert("No se pudieron cargar los productos reales.");
      if (isMounted.current && !signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const fetchProviders = async (signal?: AbortSignal) => {
    try {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .eq("is_active", true)
        .abortSignal(signal as any);

      if (error) {
        if (isAbortError(error)) return;
        console.error("Error fetching providers:", error);
        return;
      }
      if (data && isMounted.current) {
        setProviders(data);
        const bodegas = new Set<string>();
        const puestos = new Set<string>();
        data.forEach(p => {
          if (p.warehouse_location) bodegas.add(String(p.warehouse_location).trim());
          if (p.puesto) puestos.add(String(p.puesto).trim());
        });
        setAvailableBodegas(Array.from(bodegas).filter(Boolean).sort());
        setAvailablePuestos(Array.from(puestos).filter(Boolean).sort());
      }
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("Exception in fetchProviders:", err);
    }
  };

  const getFilteredProviders = () => {
    return providers
      .filter((p) => p.category === "PRODUCTOS")
      .filter((p) => {
        const text = providerSearchText.toLowerCase();
        const prodMatch = (p.product || "").toLowerCase().includes(text);
        const nameMatch = (p.name || "").toLowerCase().includes(text);
        return prodMatch || nameMatch;
      })
      .sort((a, b) => (a.product || "").localeCompare(b.product || ""));
  };

  const runConsolidation = async (signal?: AbortSignal) => {
    const targetDate = await getTargetDeliveryDate(signal);
    if (!targetDate) return;

    // 1. Obtener items de pedidos ACTIVOS (SIN RESTRICCIÓN DE FECHA - DESACTIVADO TEMPORALMENTE)
    const { data: items, error: fetchErr } = await supabase
      .from("order_items")
      .select(
        `
                  id, 
                  quantity, 
                  product_id, 
                  variant_label,
                  products(unit_of_measure),
                  orders!inner(delivery_date, status)
              `,
      )
      .in("orders.status", ["para_compra", "approved", "picking"])
      .abortSignal(signal as any);

    if (fetchErr) {
      if (isAbortError(fetchErr)) return;
      console.error("Error fetching items for consolidation:", fetchErr);
      return;
    }

    if (!items || items.length === 0) {
      return;
    }

    // 2. Agrupar por producto, variante Y FECHA
    const totals: Record<
      string,
      {
        qty: number;
        unit: string;
        pid: string;
        variant: string;
        delivery_date: string;
      }
    > = {};
    items.forEach((item) => {
      const variant = item.variant_label || "";
      const dDate = item.orders?.delivery_date || targetDate;
      const key = `${item.product_id}_${variant}_${dDate}`;
      if (!totals[key]) {
        totals[key] = {
          qty: 0,
          unit: item.products?.unit_of_measure || "kg",
          pid: item.product_id,
          variant: variant,
          delivery_date: dDate,
        };
      }
      totals[key].qty += item.quantity;
    });

    // 3. Upsert en procurement_tasks (Evita duplicados por llave PID + VAR + FECHA)
    for (const key in totals) {
      const task = totals[key];
      const { data: existing } = await supabase
        .from("procurement_tasks")
        .select("id, total_requested")
        .eq("product_id", task.pid)
        .eq("variant_label", task.variant)
        .eq("delivery_date", task.delivery_date)
        .abortSignal(signal as any)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("procurement_tasks")
          .update({ total_requested: task.qty })
          .eq("id", existing.id);
      } else {
        await supabase.from("procurement_tasks").insert({
          product_id: task.pid,
          variant_label: task.variant,
          total_requested: task.qty,
          unit: task.unit,
          delivery_date: task.delivery_date,
        });
      }
    }
  };

  const handleConsolidate = async () => {
    setIsConsolidating(true);
    setLoading(true);
    try {
      await runConsolidation();
      alert(`✅ Sincronización Exitosa`);
      fetchTasks();
    } catch (e: unknown) {
      console.error(e);
      alert("Error al consolidar pedidos: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsConsolidating(false);
      setLoading(false);
    }
  };

  const handleSubSearch = async () => {
    if (searchSub.length < 2) return;
    const { data } = await supabase
      .from("products")
      .select("id, name, unit_of_measure, category")
      .ilike("name", `%${searchSub}%`)
      .limit(5);
    setSubResults(data || []);
  };

  const resetForm = () => {
    setQty("");
    setPrice("");
    setSelectedProvider("");
    setLocation("");
    setIsSubstituting(false);
    setSearchSub("");
    setSubResults([]);
    setVoucherFile(null);
    setVoucherPreview(null);
    setIsQuickProvider(false);
    setNewProviderName("");
    setNewProviderLoc("");
    setNewProviderTaxId("");
    setNewProviderPhone("");
    setNewProviderEmail("");
    setPurchaseUnit("Kg");
    setPickupTimeMinutes(0); // Default to 'YA' for convenience
    setFormError(null);
    setPurchaseSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVoucherFile(file);
      setVoucherPreview(URL.createObjectURL(file));
    }
  };

  const uploadVoucher = async () => {
    if (!voucherFile) return null;
    setUploadingImage(true);
    try {
      const fileExt = voucherFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("vouchers")
        .upload(filePath, voucherFile, {
          contentType: voucherFile.type || "image/jpeg"
        });

      if (uploadError) {
        diagnoseStorageError(uploadError, 'vouchers');
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("vouchers").getPublicUrl(filePath);

      return publicUrl;
    } catch (err: any) {
      diagnoseStorageError(err, "vouchers");
      alert("Error subiendo la foto del vale: " + (err.message || err));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const confirmSubstitution = async (newProduct: any) => {
    if (!selectedTask) return;

    // Persistir la sustitución en Base de Datos
    try {
      const { error } = await supabase
        .from("procurement_tasks")
        .update({
          product_id: newProduct.id,
          // Si ya tenía un original, lo mantenemos. Si no, guardamos el actual como original.
          original_product_id:
            selectedTask.original_product_id || selectedTask.product_id,
          // status: 'pending' // Mantenemos el status actual (pending o partial)
        })
        .eq("id", selectedTask.id);

      if (error) throw error;

      // Actualizar estado local
      const updated = tasks.map((t) =>
        t.id === selectedTask.id
          ? {
              ...t,
              product_name: `${newProduct.name} (Sustituto)`,
              product_id: newProduct.id,
              unit: newProduct.unit_of_measure,
              original_product_id:
                selectedTask.original_product_id || selectedTask.product_id,
            }
          : t,
      );

      setTasks(updated);
      alert(`Sustitución realizada con éxito por: ${newProduct.name}`);
      resetForm();
      setSelectedTask((prev) =>
        prev
          ? {
              ...prev,
              product_id: newProduct.id,
              product_name: newProduct.name,
              unit: newProduct.unit_of_measure,
            }
          : null,
      );
    } catch (err: any) {
      console.error("Error substituting task:", err);
      alert("Error al guardar la sustitución: " + err.message);
    }
  };

  const handleSavePurchase = async () => {
    if (!selectedTask) return;
    setFormError(null);

    // Validación de campos obligatorios con mensajes específicos
    if (!qty) {
      setFormError("⚠️ Indica la cantidad de la compra");
      return;
    }
    if (!price) {
      setFormError("⚠️ Indica el precio unitario");
      return;
    }
    if (isQuickProvider && !newProviderName) {
      setFormError("⚠️ Indica el nombre del nuevo proveedor");
      return;
    }
    if (!isQuickProvider && !selectedProvider) {
      setFormError("⚠️ Selecciona un proveedor de la lista");
      return;
    }
    if (!voucherFile) {
      setFormError(
        "⚠️ Es obligatorio tomar una foto de la evidencia (Vale/Factura)",
      );
      return;
    }
    if (pickupTimeMinutes === null) {
      setFormError("⚠️ Selecciona una hora estimada de recogida");
      return;
    }

    let providerId = selectedProvider;

    if (isQuickProvider) {
      setSubmitting(true);
      try {
        const { data: newP, error: pErr } = await supabase
          .from("providers")
          .insert({
            name: newProviderName,
            location: newProviderLoc || "General",
            tax_id: newProviderTaxId,
            contact_phone: newProviderPhone,
            email: newProviderEmail,
            category: "Varios",
          })
          .select()
          .single();

        if (pErr) throw pErr;
        if (newP) providerId = newP.id;
      } catch (err: any) {
        setFormError("Error creando proveedor: " + err.message);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(true);

    try {
      const cost = parseFloat(qty) * parseFloat(price);

      // 0. Subir imagen primero si existe
      const voucherImageUrl = await uploadVoucher();

      // Calcular hora estimada
      let estimatedPickup = null;
      if (pickupTimeMinutes !== null) {
        const date = new Date();
        date.setMinutes(date.getMinutes() + pickupTimeMinutes);
        estimatedPickup = date.toISOString();
      }

      // 1. Guardar la compra
      const { error: pErr } = await supabase.from("purchases").insert({
        task_id: selectedTask.id,
        product_id: selectedTask.product_id,
        variant_label: selectedTask.variant_label,
        provider_id: providerId,
        quantity: parseFloat(qty),
        unit_price: parseFloat(price),
        total_cost: cost,
        voucher_image_url: voucherImageUrl,
        purchase_unit: purchaseUnit,
        estimated_pickup_time: estimatedPickup,
        pickup_location:
          location ||
          newProviderLoc ||
          providers.find((p) => p.id === providerId)?.location,
        status: "pending_pickup", // Mark as pending pickup so logistics team sees it
      });

      if (pErr) throw pErr;

      // 2. Actualizar la tarea (Progreso acumulado con equivalencias)
      let baseQtyToAdd = parseFloat(qty);

      // Buscar si hay una conversión para este producto y la unidad seleccionada
      const conversion = conversions.find(
        (c) =>
          c.product_id === selectedTask.product_id &&
          c.from_unit === purchaseUnit &&
          c.to_unit === selectedTask.unit,
      );

      if (conversion) {
        baseQtyToAdd =
          parseFloat(qty) * parseFloat(conversion.conversion_factor);
        console.log(
          `Aplicando conversión: ${qty} ${purchaseUnit} -> ${baseQtyToAdd} ${selectedTask.unit}`,
        );
      }

      const newPurchased = (selectedTask.total_purchased || 0) + baseQtyToAdd;
      const newStatus =
        newPurchased >= selectedTask.total_requested ? "completed" : "partial";

      const { error: tErr } = await supabase
        .from("procurement_tasks")
        .update({
          total_purchased: newPurchased,
          status: newStatus,
        })
        .eq("id", selectedTask.id);

      setSelectedTask(prev => prev ? { ...prev, total_purchased: newPurchased, status: newStatus } : null);
      setPurchaseSuccess(true);
      setTimeout(() => {
        resetForm();
        setSelectedTask(null);
        fetchTasks(undefined, filterCategory);
        fetchProviders();
      }, 4000);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShortfall = async (item: ProcurementTask) => {
    if (!confirm(`¿Cerrar faltante para ${item.product_name}? Se ajustará la meta a la cantidad comprada actual.`)) return;
    try {
      const taskNovs = novelties.filter(n => n.task_id === item.id);
      for (const n of taskNovs) {
        await resolvePurchaseNovelty({ id: n.purchase_id, task_id: item.id, ...n }, 'closed_with_shortfall');
      }
      
      const { error } = await supabase
        .from("procurement_tasks")
        .update({
          total_requested: item.total_purchased,
          status: "completed"
        })
        .eq("id", item.id);
      if (error) throw error;

      alert("🏁 Faltante cerrado con éxito!");
      fetchTasks(undefined, filterCategory);
    } catch (e: any) {
      alert("Error cerrando faltante: " + e.message);
    }
  };

  // Helper Fecha
  const nowBogotaStr = new Date().toLocaleString("en-US", {
    timeZone: "America/Bogota",
  });
  const todayYMD = new Date(nowBogotaStr).toISOString().split("T")[0];

  // Cálculos de Gamificación y Dashboard
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const partialTasks = tasks.filter((t) => t.status === "partial").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const totalProgress =
    tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
  const noveltyCount = novelties.length;
  const rejectionCount = novelties.filter(n => n.novelty_type === 'rejection').length;

  // Estadísticas por Sublista de Compra
  const dynamicCategories = [
    "DESPENSA",
    "FRUTA SELECCIONADA",
    "HORTALIZA SELECCIONADA",
    "PLATANOS",
    "TOMATE",
    "TUBERCULOS - PAPA",
    "VERDURAS"
  ];
  const categoryStats = dynamicCategories.map((cat) => {
    const catTasks = tasks.filter((t) => t.category === cat);
    const completed = catTasks.filter((t) => t.status === "completed").length;
    const percentage =
      catTasks.length > 0 ? Math.round((completed / catTasks.length) * 100) : 0;
    return { name: cat as string, percentage, count: catTasks.length };
  });
  const currentCategoryStat = filterCategory && filterCategory !== "Ver Todo"
    ? categoryStats.find(s => s.name === filterCategory)
    : { percentage: totalProgress, count: tasks.length };
    
  const currentProgress = currentCategoryStat ? currentCategoryStat.percentage : 0;
  
  const prevProgressRef = useRef(0);
  
  useEffect(() => {
    if (currentProgress === 100 && prevProgressRef.current < 100 && tasks.length > 0) {
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          zIndex: 9999
        });
      }, 300);
    }
    prevProgressRef.current = currentProgress;
}, [currentProgress, tasks.length]);

  return (
    <div style={{ padding: "1rem", paddingBottom: "5rem" }}>
      {/* Ocultar Barra de Scroll (Estilo App Nativa) y Estilos de Impresión */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
                ::-webkit-scrollbar { width: 0 !important; display: none; }
                html, body { -ms-overflow-style: none; scrollbar-width: none; }

                @media (max-width: 480px) {
                    .header-title-container {
                        font-size: 1.15rem !important;
                        gap: 0.35rem !important;
                    }
                    .header-date-badge {
                        font-size: 0.68rem !important;
                        padding: 2px 6px !important;
                    }
                    .header-tutor-btn {
                        font-size: 0.68rem !important;
                        padding: 0.4rem 0.6rem !important;
                    }
                }

                /* Ocultar flechas de input number */
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }

                    .print-only {
                        display: none !important;
                    }

                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(0.98); }
                    100% { opacity: 1; transform: scale(1); }
                }

                @keyframes pulse-red {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    50% { transform: scale(1.03); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                }

                @keyframes pulse-rejection-soft {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.82; }
                }

                @keyframes pulse-orange {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
                    50% { transform: scale(1.03); box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
                }

                @keyframes pulse-yellow {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
                    50% { transform: scale(1.03); box-shadow: 0 0 0 6px rgba(234, 179, 8, 0); }
                }


                @media print {
                    header, nav, footer, .no-print { 
                        display: none !important; 
                    }
                    .print-only {
                        display: block !important;
                    }
                    body {
                        background-color: white !important;
                        color: black !important;
                    }
                    .print-container {
                        display: block !important;
                        padding: 20px !important;
                    }
                    .card-op {
                        display: none !important; /* Hide cards in print, use table instead */
                    }
                    .ops-theme-wrapper {
                        background-color: white !important;
                    }
                    main {
                        padding-bottom: 0 !important;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 8px;
                        text-align: left;
                        font-size: 10pt;
                    }
                    th {
                        background-color: #eee !important;
                        -webkit-print-color-adjust: exact;
                    }
                }
            `,
        }}
      />

      {/* Título y Botón (No pegajosos, se ocultan al hacer scroll) */}
      <div
        className="no-print"
        style={{
          paddingTop: "0.5rem",
          paddingBottom: "0.5rem",
          backgroundColor: "var(--ops-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.5rem",
            padding: "0 0.5rem",
          }}
        >
          <div>
            <h1 
              className="header-title-container"
              style={{ fontSize: "1.5rem", fontWeight: "900", margin: 0, display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "nowrap" }}
            >
              <span style={{ whiteSpace: "nowrap" }}>Compras <span style={{ color: "var(--ops-primary)" }}>Hoy</span></span>
              <span className="header-date-badge" style={{ fontSize: "0.8rem", color: "#F59E0B", fontWeight: "800", backgroundColor: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>
                <Calendar size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> {formatDateFriendly(targetDateLabel)}
              </span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleConsolidate}
              disabled={isConsolidating}
              style={{
                backgroundColor: "var(--ops-primary)",
                color: "white",
                border: "none",
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: "900",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                opacity: isConsolidating ? 0.6 : 1,
              }}
            >
              <RefreshCw
                size={13}
                style={{
                  marginRight: '4px',
                  verticalAlign: 'middle',
                  animation: isConsolidating ? 'spin 1.5s linear infinite' : 'none'
                }}
              />
              {isConsolidating ? "CONSOLIDANDO..." : "CONSOLIDAR"}
            </button>

            <button
              className="header-tutor-btn"
              onClick={() => { setShowGuide(true); setGuideStep(0); }}
              style={{
                backgroundColor: "var(--ops-surface)",
                color: "var(--ops-primary)",
                border: "1px solid var(--ops-primary)",
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: "900",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <BookOpen size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> TUTOR
            </button>
          </div>
        </div>
      </div>

      {/* STICKY CONTAINER (Barra de progreso + Dashboard de estados) */}
      <div
        className="no-print"
        style={{
          position: "sticky",
          top: "57px",
          zIndex: 50,
          backgroundColor: "var(--ops-bg)",
          paddingBottom: "0.8rem",
          marginBottom: "1rem",
          borderBottom: "1px solid var(--ops-border)",
        }}
      >
        {/* Barra de Progreso Lineal (General) */}
        {tasks.length > 0 && (
          <div
            style={{ width: "100%", marginTop: "0.4rem", marginBottom: "1rem", padding: "0 0.5rem" }}
          >
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "var(--ops-surface)",
                borderRadius: "4px",
                overflow: "hidden",
                border: "1px solid var(--ops-border)",
              }}
            >
              <div
                style={{
                  width: `${totalProgress}%`,
                  height: "100%",
                  backgroundImage:
                    totalProgress === 100
                      ? "linear-gradient(90deg, #059669, #10B981)"
                      : "linear-gradient(90deg, #3B82F6, #06B6D4)",
                  transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>
        )}

        {/* Dashboard de Estados (Semáforo) */}
        {tasks.length > 0 && (
          <div
            style={{
              backgroundColor: "var(--ops-surface)",
              borderRadius: "16px",
              border: "1px solid var(--ops-border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              display: "flex",
              justifyContent: "space-evenly",
              alignItems: "center",
              padding: "0.6rem 0.8rem",
            }}
          >
            {/* Pendientes (Gris/Rojo Suave) */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "900",
                  color: "var(--ops-text-muted)",
                }}
              >
                {pendingTasks}
              </div>
              <div
                style={{
                  fontSize: "0.55rem",
                  fontWeight: "bold",
                  color: "var(--ops-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Pendientes
              </div>
            </div>

            {/* En Proceso (Amarillo) */}
            <div style={{ textAlign: "center", position: "relative" }}>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "900",
                  color: "#F59E0B",
                }}
              >
                {partialTasks}
              </div>
              <div
                style={{
                  fontSize: "0.55rem",
                  fontWeight: "bold",
                  color: "#F59E0B",
                  textTransform: "uppercase",
                }}
              >
                En Proceso
              </div>
              {partialTasks > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "#F59E0B",
                  }}
                />
              )}
            </div>

            {/* Completados (Verde) */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "var(--ops-primary)" }}>
                {completedTasks}
              </div>
              <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "var(--ops-primary)", textTransform: "uppercase" }}>
                Listos
              </div>
            </div>

            {/* Novedades (Rojo) — solo si hay */}
            {noveltyCount > 0 && (
              <div
                style={{
                  textAlign: "center",
                  borderLeft: "1px solid rgba(239,68,68,0.3)",
                  paddingLeft: "0.8rem",
                  position: "relative",
                  animation: "pulse-red 2s infinite",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#EF4444" }}>
                  {noveltyCount}
                </div>
                <div style={{ fontSize: "0.55rem", fontWeight: "900", color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Novedad
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: -3, right: -3,
                    width: "6px", height: "6px",
                    borderRadius: "50%",
                    background: "#EF4444",
                    animation: "pulse-red 1.5s infinite",
                  }}
                />
              </div>
            )}

            {/* Total Avance */}
            <div
              style={{
                textAlign: "center",
                borderLeft: "1px solid var(--ops-border)",
                paddingLeft: "0.8rem",
                marginLeft: "0.2rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <div
                style={{
                  backgroundColor: totalProgress === 100 ? "var(--ops-primary)" : "rgba(59, 130, 246, 0.15)",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "10px",
                  border: `1px solid ${totalProgress === 100 ? "var(--ops-primary)" : "rgba(59, 130, 246, 0.3)"}`,
                  boxShadow: totalProgress > 0 ? "0 0 15px rgba(59, 130, 246, 0.2)" : "none",
                  transition: "all 0.4s ease",
                }}
              >
                <div style={{ fontSize: "1.2rem", fontWeight: "900", color: totalProgress === 100 ? "white" : "var(--ops-text)", lineHeight: "1" }}>
                  {Math.round(totalProgress)}%
                </div>
                <div style={{ fontSize: "0.5rem", fontWeight: "900", color: totalProgress === 100 ? "white" : "var(--ops-text)", opacity: 0.8, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  TOTAL AVANCE
                </div>
              </div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--ops-border)',
                  color: 'var(--ops-text)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                title="Subir al inicio"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
              >
                ▲
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Filter — Colapsable */}
      <div style={{ marginBottom: "1.5rem" }}>

        {/* Barra activa: siempre visible */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Pill de categoría activa */}
          <div
            style={{
              flex: 1,
              padding: "0.5rem 1rem",
              borderRadius: "12px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid var(--ops-primary)",
              color: "var(--ops-text)",
              fontSize: "0.75rem",
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              {filterCategory === "" || filterCategory === "Ver Todo"
                ? <span><List size={13} style={{ marginRight: "4px", verticalAlign: "middle" }} /> Ver Todo</span>
                : (() => {
                    const s = categoryStats.find(s => s.name === filterCategory);
                    return `${filterCategory}${s ? ` · ${s.percentage}%` : ""}`;
                  })()}
            </span>
            {(filterCategory !== "" && filterCategory !== "Ver Todo") && (
              <span style={{ opacity: 0.7, fontSize: "0.65rem" }}>activo</span>
            )}
          </div>

          {/* Botón toggle del grid */}
          <button
            onClick={() => setShowFilterGrid(v => !v)}
            title={showFilterGrid ? "Ocultar filtros" : "Cambiar categoría"}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              border: `1px solid ${showFilterGrid ? "var(--ops-primary)" : "var(--ops-border)"}`,
              backgroundColor: showFilterGrid ? "rgba(16,185,129,0.15)" : "var(--ops-surface)",
              color: showFilterGrid ? "var(--ops-primary)" : "var(--ops-text-muted)",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.2s ease",
            }}
          >
            {showFilterGrid ? "✕" : "⊞"}
          </button>
        </div>

        {/* Grid 2×4 — se muestra/oculta */}
        {showFilterGrid && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.4rem",
              marginTop: "0.5rem",
              animation: "fadeSlideDown 0.18s ease-out",
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes fadeSlideDown {
                from { opacity: 0; transform: translateY(-6px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}} />
            {["Ver Todo", ...categoryStats.map(s => s.name)].map((cat) => {
              const stat = categoryStats.find(s => s.name === cat);
              const isActive = filterCategory === cat || (cat === "Ver Todo" && (filterCategory === "" || filterCategory === "Ver Todo"));
              const pct = stat?.percentage ?? null;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setFilterCategory(cat);
                    fetchTasks(undefined, cat);
                    setShowFilterGrid(false);
                  }}
                  style={{
                    padding: "0.55rem 0.75rem",
                    borderRadius: "10px",
                    border: isActive 
                      ? "1px solid var(--ops-primary)" 
                      : pct === 100 
                        ? "1px solid rgba(16, 185, 129, 0.6)" 
                        : "1px solid var(--ops-border)",
                    backgroundColor: isActive
                      ? "rgba(16, 185, 129, 0.12)"
                      : pct === 100 
                        ? "rgba(16, 185, 129, 0.15)"
                        : "var(--ops-surface)",
                    color: isActive ? "var(--ops-text)" : pct === 100 ? "#059669" : "var(--ops-text-muted)",
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    transition: "all 0.15s ease",
                    boxShadow: pct === 100 && !isActive ? "0 0 12px rgba(16, 185, 129, 0.25)" : "none",
                    transform: pct === 100 && !isActive ? "scale(1.02)" : "scale(1)",
                  }}
                >
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2, display: "flex", alignItems: "center", gap: "4px" }}>
                    {cat === "Ver Todo" ? <span style={{ display: "inline-flex", alignItems: "center" }}><List size={13} style={{ marginRight: "4px" }} /> Ver Todo</span> : (
                      <>
                        {cat} {pct === 100 && <span style={{ fontSize: "0.85rem", filter: "drop-shadow(0 0 2px rgba(16,185,129,0.5))" }}>✨</span>}
                      </>
                    )}
                  </span>
                  {pct !== null && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: "900",
                        opacity: isActive ? 0.85 : 0.9,
                        color: isActive
                          ? "white"
                          : pct === 100 ? "#10B981" : pct > 0 ? "#F59E0B" : "inherit",
                        textShadow: pct === 100 && !isActive ? "0 0 8px rgba(16, 185, 129, 0.4)" : "none",
                      }}
                    >
                      {pct === 100 ? "✓ 100% LISTO" : `${pct}% listo`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Print-Only Table Section */}
      <div className="print-only">
        <h1 style={{ textAlign: "center" }}>Lista de Compras - Logistics Pro</h1>
        <p style={{ textAlign: "center" }}>
          Fecha de Entrega: {formatDateFriendly(targetDateLabel)}
        </p>
        <table>
          <thead>
            <tr>
              <th style={{ width: "40px" }}>[ ]</th>
              <th>Producto</th>
              <th>Variante</th>
              <th>Categoría</th>
              <th>Cantidad</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {tasks
              .filter(
                (t) =>
                  !filterCategory ||
                  filterCategory === "Ver Todo" ||
                  t.category === filterCategory,
              )
              .map((task) => (
                <tr key={task.id}>
                  <td></td>
                  <td>{task.product_name}</td>
                  <td>{task.variant_label || "-"}</td>
                  <td>{task.category}</td>
                  <td>
                    {(task.total_requested - task.total_purchased).toFixed(2)}
                  </td>
                  <td>{task.unit}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", animation: "pulse 2s infinite" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ops-primary)", animation: "spin 2s linear infinite", marginBottom: "1rem" }}><RefreshCw size={36} /></div>
          <p style={{ color: "var(--ops-text-muted)", fontWeight: "700", letterSpacing: "0.05em" }}>
            {isConsolidating ? "SINCRONIZANDO Y CONSOLIDANDO PEDIDOS DE HOY..." : "BUSCANDO PEDIDOS..."}
          </p>
        </div>
      ) : tasks.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "4rem 2rem",
          backgroundColor: "rgba(16, 185, 129, 0.05)",
          borderRadius: "24px",
          border: "1px dashed rgba(16, 185, 129, 0.2)",
          margin: "0 0.5rem"
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1.5rem" }}>✨</div>
          <h3 style={{ color: "var(--ops-primary)", fontSize: "1.5rem", fontWeight: "900", margin: "0 0 0.5rem 0" }}>
            ¡Todo bajo control!
          </h3>
          <p style={{ color: "var(--ops-text-muted)", fontSize: "1rem", maxWidth: "250px", margin: "0 auto", lineHeight: "1.4" }}>
            {filterCategory && filterCategory !== "Ver Todo"
              ? `No hay compras pendientes en la categoría de ${filterCategory}.`
              : "No se han encontrado compras generadas para esta jornada."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {currentProgress === 100 && tasks.length > 0 && (
            <div style={{
              textAlign: "center",
              padding: "1.5rem",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              border: "2px solid #10B981",
              borderRadius: "16px",
              boxShadow: "0 0 20px rgba(16, 185, 129, 0.2)",
              animation: "popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
            }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏆</div>
              <h2 style={{ margin: 0, color: "#10B981", fontSize: "1.4rem", fontWeight: "900" }}>
                ¡Misión Cumplida!
              </h2>
              <p style={{ margin: "0.25rem 0 0 0", color: "var(--ops-text-muted)", fontSize: "0.9rem" }}>
                Has completado todas las compras de esta categoría por hoy.
              </p>
            </div>
          )}
          {(() => {
            const grouped: Record<string, {
              product_id: string;
              product_name_base: string;
              category: string;
              delivery_date: string;
              total_requested: number;
              total_purchased: number;
              unit: string;
              status: "pending" | "partial" | "completed";
              items: ProcurementTask[];
              hasRejection: boolean;
              hasDeficit: boolean;
              hasWarning: boolean;
            }> = {};

            tasks.filter(t => !filterCategory || filterCategory === "Ver Todo" || t.category === filterCategory).forEach((task) => {
              const baseKey = task.parent_id || task.product_id;
              if (!grouped[baseKey]) {
                let baseName = task.parent_name || task.product_name;
                const idx = baseName.lastIndexOf(" (");
                if (idx !== -1 && baseName.endsWith(")")) {
                  baseName = baseName.slice(0, idx);
                }
                grouped[baseKey] = {
                  product_id: baseKey,
                  product_name_base: baseName,
                  category: task.category,
                  delivery_date: task.delivery_date || "",
                  total_requested: 0,
                  total_purchased: 0,
                  unit: task.unit,
                  status: "pending",
                  items: [],
                  hasRejection: false,
                  hasDeficit: false,
                  hasWarning: false
                };
              }
              grouped[baseKey].total_requested += task.total_requested;
              grouped[baseKey].total_purchased += task.total_purchased;
              grouped[baseKey].items.push(task);

              if (task.hasRejection) grouped[baseKey].hasRejection = true;
              if (task.hasDeficit) grouped[baseKey].hasDeficit = true;
              if (task.hasWarning) grouped[baseKey].hasWarning = true;
            });

            // Update status of groups
            Object.values(grouped).forEach((group) => {
              const allCompleted = group.items.every((item) => item.status === "completed");
              const anyPartial = group.items.some((item) => item.status === "partial" || item.total_purchased > 0);
              if (allCompleted) {
                group.status = "completed";
              } else if (anyPartial) {
                group.status = "partial";
              } else {
                group.status = "pending";
              }
            });

            // Sort groups by severity
            const sortedGroups = Object.values(grouped).sort((a, b) => {
              const getGroupSeverity = (g: typeof a): number => {
                if (g.hasRejection) return 0;
                if (g.hasDeficit) return 1;
                if (g.hasWarning) return 2;
                if (g.status === "partial") return 3;
                if (g.status === "pending") return 4;
                return 5;
              };
              const sevA = getGroupSeverity(a);
              const sevB = getGroupSeverity(b);
              if (sevA !== sevB) return sevA - sevB;

              const dateA = a.delivery_date || "9999-99-99";
              const dateB = b.delivery_date || "9999-99-99";
              return dateA.localeCompare(dateB);
            });

            return sortedGroups.map((group) => {
              const hasVariants = group.items.length > 1 || (group.items[0] && group.items[0].variant_label);
              const isDone = group.status === "completed";

              // Check group novelty severity for layout
              let groupBorderColor = "var(--ops-border)";
              if (group.hasRejection) groupBorderColor = "#EF4444";
              else if (group.hasDeficit) groupBorderColor = "#F59E0B";
              else if (group.hasWarning) groupBorderColor = "#FBBF24";
              else if (isDone) groupBorderColor = "var(--ops-primary)";
              else if (group.status === "partial") groupBorderColor = "#F59E0B";

              return (
                <div
                  key={group.product_id}
                  className="card-op"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                    borderLeft: `6px solid ${groupBorderColor}`,
                    opacity: isDone ? 0.75 : 1,
                    transition: "all 0.2s ease",
                    padding: "1.2rem",
                    position: "relative",
                    backgroundColor: group.hasRejection ? "rgba(239, 68, 68, 0.07)" : undefined,
                    boxShadow: group.hasRejection ? "0 0 12px rgba(239, 68, 68, 0.15), inset 0 0 0 1px rgba(239, 68, 68, 0.18)" : undefined,
                    animation: group.hasRejection ? "pulse-rejection-soft 4s ease-in-out infinite" : undefined,
                  }}
                  onClick={() => {
                    // Click on parent card opens first item if no variants
                    if (!hasVariants && group.items[0]) {
                      setSelectedTask(group.items[0]);
                      const u = (group.items[0].unit || "").toLowerCase();
                      if (u === "unidad" || u === "und") setPurchaseUnit("Unidad");
                      else if (u === "bulto") setPurchaseUnit("Bulto");
                      else if (u === "caja") setPurchaseUnit("Caja");
                      else if (u === "canastilla") setPurchaseUnit("Canastilla");
                      else setPurchaseUnit("Kg");
                    }
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: "0.68rem", color: "var(--ops-text-muted)", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {group.category} • {formatDateFriendly(group.delivery_date)} {isDone && "✓"}
                      </span>
                      <h2 style={{ margin: "0.2rem 0", fontSize: "1.15rem", fontWeight: "900", color: isDone ? "var(--ops-text-muted)" : "var(--ops-text)" }}>
                        {group.product_name_base}
                      </h2>
                    </div>

                    {/* Novelty Badges */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-end" }}>
                      {group.hasRejection && (
                        <span className="badge-pulse-red" style={{
                          padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.65rem", fontWeight: "900",
                          backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#EF4444", border: "1px solid #EF4444",
                          animation: "pulse-red 2s infinite", display: "flex", alignItems: "center", gap: "3px"
                        }}>
                          🔴 DEVOLUCIÓN
                        </span>
                      )}
                      {group.hasDeficit && (
                        <span className="badge-pulse-orange" style={{
                          padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.65rem", fontWeight: "900",
                          backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#F59E0B", border: "1px solid #F59E0B",
                          animation: "pulse-orange 2s infinite", display: "flex", alignItems: "center", gap: "3px"
                        }}>
                          🟠 FALTANTE
                        </span>
                      )}
                      {group.hasWarning && (
                        <span className="badge-pulse-yellow" style={{
                          padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.65rem", fontWeight: "900",
                          backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#EAB308", border: "1px solid #EAB308",
                          animation: "pulse-yellow 2s infinite", display: "flex", alignItems: "center", gap: "3px"
                        }}>
                          🟡 ALERTA CALIDAD
                        </span>
                      )}
                      {!group.hasRejection && !group.hasDeficit && !group.hasWarning && (
                        <span style={{ fontSize: "0.7rem", fontWeight: "800", color: isDone ? "var(--ops-primary)" : "var(--ops-text-muted)" }}>
                          {isDone ? "COMPLETADO" : group.status === "partial" ? "EN PROCESO" : "PENDIENTE"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Overall progress bar */}
                  <div style={{ width: "100%", height: "6px", backgroundColor: "var(--ops-border)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, (group.total_purchased / group.total_requested) * 100)}%`,
                      height: "100%",
                      backgroundColor: isDone ? "var(--ops-primary)" : "#F59E0B",
                      transition: "width 0.4s ease"
                    }} />
                  </div>

                  {/* Summary of quantities */}
                  <div style={{ display: "flex", justifyContent: "flex-start", gap: "0.75rem", alignItems: "center", fontSize: "0.8rem", color: "var(--ops-text-muted)" }}>
                    <span>
                      Meta: <strong style={{ color: "var(--ops-text)" }}>{group.total_requested.toFixed(0)} {group.unit}</strong> | Comprado: <strong style={{ color: "var(--ops-text)" }}>{group.total_purchased.toFixed(0)} {group.unit}</strong> | Faltante: <strong style={{ color: isDone ? "#10B981" : "#F59E0B" }}>{Math.max(0, group.total_requested - group.total_purchased).toFixed(0)} {group.unit}</strong>
                    </span>
                    {group.total_purchased > group.total_requested && (
                      <span style={{
                        color: "#3B82F6", fontWeight: "800", backgroundColor: "rgba(59, 130, 246, 0.15)",
                        padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.65rem", border: "1px solid rgba(59, 130, 246, 0.3)"
                      }}>
                        +{ (group.total_purchased - group.total_requested).toFixed(0) } {group.unit} EXCEDENTE
                      </span>
                    )}
                    {group.hasRejection && (
                      <span style={{
                        color: "#EF4444", fontWeight: "800", backgroundColor: "rgba(239, 68, 68, 0.15)",
                        padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.65rem", border: "1px solid rgba(239, 68, 68, 0.3)"
                      }}>
                        {/* Calculate rejection sum in base unit */}
                        {(() => {
                          const rejQty = group.items.reduce((acc, item) => {
                            const itemNovs = novelties.filter(n => n.task_id === item.id && n.novelty_type === 'rejection');
                            return acc + itemNovs.reduce((nAcc, n) => nAcc + (n.quantity || 0), 0);
                          }, 0);
                          return `${rejQty.toFixed(0)} ${group.unit} EN DEVOLUCIÓN`;
                        })()}
                      </span>
                    )}
                  </div>

                  {/* Variants List Section */}
                  {hasVariants && (
                    <div style={{
                      marginTop: "0.5rem",
                      display: "grid",
                      gap: "0.6rem",
                      borderTop: "1px solid var(--ops-border)",
                      paddingTop: "0.75rem"
                    }}>
                      {group.items.map((item) => {
                        const itemDone = item.status === "completed";
                        
                        let itemStatusColor = "var(--ops-text-muted)";
                        if (item.hasRejection) itemStatusColor = "#EF4444";
                        else if (item.hasDeficit) itemStatusColor = "#F59E0B";
                        else if (item.hasWarning) itemStatusColor = "#EAB308";
                        else if (itemDone) itemStatusColor = "var(--ops-primary)";

                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              alignItems: "center",
                              padding: "0.6rem 0.8rem",
                              borderRadius: "12px",
                              backgroundColor: "var(--ops-bg)",
                              border: `1px solid ${item.hasRejection || item.hasDeficit || item.hasWarning ? itemStatusColor : "var(--ops-border)"}`,
                              cursor: "pointer",
                              transition: "all 0.2s ease"
                            }}
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering parent onClick
                              setSelectedTask(item);
                              const u = (item.unit || "").toLowerCase();
                              if (u === "unidad" || u === "und") setPurchaseUnit("Unidad");
                              else if (u === "bulto") setPurchaseUnit("Bulto");
                              else if (u === "caja") setPurchaseUnit("Caja");
                              else if (u === "canastilla") setPurchaseUnit("Canastilla");
                              else setPurchaseUnit("Kg");
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                {(item.hasRejection || item.hasDeficit || item.hasWarning) && (
                                  <span style={{
                                    width: "8px", height: "8px", borderRadius: "50%",
                                    backgroundColor: itemStatusColor,
                                    boxShadow: `0 0 6px ${itemStatusColor}`
                                  }} />
                                )}
                                <span style={{ fontWeight: "700", fontSize: "0.85rem", color: "var(--ops-text)" }}>
                                  {item.product_id !== group.product_id ? item.product_name : (item.variant_label || "Estándar")}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--ops-text-muted)", marginTop: "2px" }}>
                                Meta: <strong style={{ color: "var(--ops-text)" }}>{(item.meta_neteo || 0).toFixed(0)} {item.unit}</strong> | Comprado: <strong style={{ color: "var(--ops-text)" }}>{(item.total_purchased || 0).toFixed(0)} {item.unit}</strong> | Faltante: <strong style={{ color: item.status === "completed" ? "#10B981" : "#F59E0B" }}>{Math.max(0, (item.meta_neteo || 0) - (item.total_purchased || 0)).toFixed(0)} {item.unit}</strong>
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "2px", fontFamily: "monospace" }}>
                                Fórmula: Ped {(item.raw_order_qty || 0).toFixed(0)} - Stock {(item.applied_stock || 0).toFixed(0)} + Seg {(item.min_inventory_level || 0).toFixed(0)}
                              </div>
                            </div>

                            {/* Variant Actions & Status Badge */}
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                              {itemDone && (
                                <span style={{
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                                  color: "var(--ops-primary)",
                                  fontSize: "0.7rem",
                                  fontWeight: "800",
                                  border: "1px solid rgba(16, 185, 129, 0.3)"
                                }}>
                                  ✓ COMPRADO
                                </span>
                              )}
                              {/* Shortfall close fast action */}
                              {item.status === "partial" && (
                                <button
                                  onClick={() => handleCloseShortfall(item)}
                                  title="Cerrar faltante"
                                  style={{
                                    padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid #F59E0B",
                                    backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#F59E0B",
                                    fontSize: "0.7rem", fontWeight: "bold", cursor: "pointer"
                                  }}
                                >
                                  🏁
                                </button>
                              )}
                              {/* Fast purchase action */}
                              {!itemDone && (
                                <button
                                  onClick={async () => {
                                    // Check if we have a selected/sticky provider
                                    let provId = selectedProvider || localStorage.getItem('last_provider_id');
                                    if (!provId && providers.length > 0) {
                                      provId = providers[0].id; // Fallback to first provider
                                    }
                                    if (!provId) {
                                      alert("Por favor selecciona un proveedor primero en el modal de compras.");
                                      return;
                                    }
                                    const qtyToBuy = (item.meta_neteo || 0) - item.total_purchased;
                                    if (qtyToBuy <= 0) return;
                                    
                                    // Quick purchase register
                                    if (!confirm(`¿Registrar compra rápida de ${qtyToBuy.toFixed(1)} ${item.unit} con el último proveedor?`)) return;
                                    
                                    try {
                                      const defaultPrice = 1000; // default/mock price
                                      const cost = qtyToBuy * defaultPrice;
                                      
                                      const { error: pErr } = await supabase.from("purchases").insert({
                                        task_id: item.id,
                                        product_id: item.product_id,
                                        variant_label: item.variant_label,
                                        provider_id: provId,
                                        quantity: qtyToBuy,
                                        unit_price: defaultPrice,
                                        total_cost: cost,
                                        purchase_unit: item.unit || "Kg",
                                        status: "pending_pickup",
                                      });
                                      if (pErr) throw pErr;

                                      const { error: tErr } = await supabase
                                        .from("procurement_tasks")
                                        .update({
                                          total_purchased: item.meta_neteo,
                                          status: "completed"
                                        })
                                        .eq("id", item.id);
                                      if (tErr) throw tErr;

                                      alert("⚡ Compra rápida registrada con éxito!");
                                      fetchTasks();
                                    } catch (err: any) {
                                      alert("Error en compra rápida: " + err.message);
                                    }
                                  }}
                                  title="Compra rápida"
                                  style={{
                                    padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--ops-primary)",
                                    backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--ops-primary)",
                                    fontSize: "0.7rem", fontWeight: "bold", cursor: "pointer"
                                  }}
                                >
                                  ⚡
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* PURCHASE MODAL */}
      {selectedTask && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--ops-surface)",
              width: "100%",
              padding: "2rem 1.5rem",
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              maxHeight: "90vh",
              overflowY: "auto",
              color: "var(--ops-text)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem" }}>
                  {selectedTask.product_name}
                </h3>
                <div
                  style={{ display: "flex", gap: "1rem", marginTop: "0.2rem" }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "var(--ops-text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Pedido:{" "}
                    <span
                      style={{ fontWeight: "800", color: "var(--ops-text)" }}
                    >
                      {selectedTask.total_requested} {selectedTask.unit}
                    </span>
                  </p>
                  {selectedTask.total_requested -
                    (selectedTask.total_purchased || 0) >
                  0 ? (
                    <p
                      style={{
                        margin: 0,
                        color: "#F59E0B",
                        fontSize: "0.85rem",
                      }}
                    >
                      Faltan:{" "}
                      <span style={{ fontWeight: "800" }}>
                        {selectedTask.total_requested -
                          (selectedTask.total_purchased || 0)}{" "}
                        {selectedTask.unit}
                      </span>
                    </p>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        color: "#EF4444",
                        fontSize: "0.85rem",
                      }}
                    >
                      Extra:{" "}
                      <span style={{ fontWeight: "800" }}>
                        +
                        {(selectedTask.total_purchased || 0) -
                          selectedTask.total_requested}{" "}
                        {selectedTask.unit}
                      </span>
                    </p>
                  )}
                  {/* Netting formula badge */}
                  <div style={{
                    fontSize: "0.72rem",
                    color: "var(--ops-text-muted)",
                    fontFamily: "monospace",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "6px",
                    border: "1px solid var(--ops-border)",
                    display: "flex",
                    alignItems: "center"
                  }}>
                    Ped: {selectedTask.raw_order_qty} | Stock: -{selectedTask.applied_stock} | Seg: +{selectedTask.min_inventory_level} → Meta: {selectedTask.meta_neteo}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  resetForm();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ops-text-muted)",
                  fontSize: "1.5rem",
                }}
              >
                ✕
              </button>
            </div>

            {purchaseSuccess ? (
              <div
                style={{
                  padding: "3rem 1.5rem",
                  textAlign: "center",
                  animation: "popIn 0.3s ease-out",
                }}
              >
                <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>
                  {selectedTask.status === "completed" ? "🎉" : "🛒"}
                </div>
                <h3
                  style={{
                    fontSize: "1.5rem",
                    color: selectedTask.status === "completed" ? "var(--ops-primary)" : "#F59E0B",
                    margin: "0 0 0.5rem 0",
                  }}
                >
                  {selectedTask.status === "completed" ? "¡Excelente Trabajo!" : "¡Compra Parcial!"}
                </h3>
                <p
                  style={{
                    color: "var(--ops-text)",
                    fontSize: "1.1rem",
                    margin: 0,
                  }}
                >
                  {selectedTask.status === "completed" 
                    ? "Compra total registrada y lista para logística." 
                    : `Has registrado ${qty} ${purchaseUnit}. Aún hay faltantes pendientes.`}
                </p>
              </div>
            ) : selectedTask.status === "completed" ? (
              <div
                style={{
                  padding: "2rem 1.5rem",
                  textAlign: "center",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid var(--ops-primary)",
                  borderRadius: "16px",
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
                  ✅
                </div>
                <h3
                  style={{
                    color: "var(--ops-primary)",
                    margin: "0 0 0.5rem 0",
                  }}
                >
                  ¡Compra Finalizada!
                </h3>
                <p
                  style={{
                    color: "var(--ops-text-muted)",
                    fontSize: "0.9rem",
                    margin: 0,
                  }}
                >
                  Ya se compraron las {selectedTask.total_requested}{" "}
                  {selectedTask.unit} requeridas. Esta tarea está cerrada.
                </p>

                {/* Desglose de Compras Realizadas */}
                <div style={{ marginTop: "2rem", textAlign: "left" }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "900", color: "var(--ops-text)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Desglose de Compras
                  </h4>
                  {taskPurchases.filter(p => p.task_id === selectedTask.id).length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--ops-text-muted)" }}>No se encontraron registros de compras directas.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      {taskPurchases.filter(p => p.task_id === selectedTask.id).map((purchase: any) => (
                        <div key={purchase.id} style={{
                          backgroundColor: "var(--ops-bg)",
                          border: "1px solid var(--ops-border)",
                          borderRadius: "12px",
                          padding: "1rem",
                          fontSize: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                            <span>👤 {purchase.provider?.name || "Proveedor Desconocido"}</span>
                            <span style={{ color: "var(--ops-primary)" }}>+{purchase.quantity} {purchase.purchase_unit || "Kg"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ops-text-muted)", fontSize: "0.75rem" }}>
                            <span>Precio: ${purchase.unit_price} / {purchase.purchase_unit || "Kg"}</span>
                            <span>Total: ${purchase.total_cost}</span>
                          </div>
                          {purchase.estimated_pickup_time && (
                            <div style={{ fontSize: "0.75rem", color: "#F59E0B" }}>
                              🕒 Hora Estimada Recogida: {new Date(purchase.estimated_pickup_time).toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem", borderTop: "1px dashed var(--ops-border)", paddingTop: "0.25rem" }}>
                            <span style={{ fontSize: "0.7rem", color: "var(--ops-text-muted)" }}>
                              Estado: <span style={{
                                fontWeight: "bold",
                                color: purchase.status === "completed" ? "var(--ops-primary)" : purchase.status === "rejected" ? "#EF4444" : "#F59E0B"
                              }}>{purchase.status === "completed" ? "Recogido ✓" : purchase.status === "rejected" ? "Devuelto/Rechazado 🔴" : "Pendiente Recogida ⏳"}</span>
                            </span>
                            {purchase.voucher_image_url && (
                              <a href={purchase.voucher_image_url} target="_blank" rel="noreferrer" style={{
                                fontSize: "0.7rem", color: "var(--ops-primary)", fontWeight: "bold", textDecoration: "underline"
                              }}>
                                Ver Vale 🖼️
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  style={{
                    marginTop: "1.5rem",
                    width: "100%",
                    padding: "1rem",
                    borderRadius: "12px",
                    backgroundColor: "var(--ops-primary)",
                    color: "white",
                    border: "none",
                    fontWeight: "bold",
                  }}
                >
                  VOLVER A LA LISTA
                </button>
              </div>
            ) : !isSubstituting ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                {/* NOVELTY RESOLUTION PANEL */}
                {novelties.filter(n => n.task_id === selectedTask.id).length > 0 && !isReprogramming && (
                  <div style={{
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid #EF4444",
                    borderRadius: "16px",
                    padding: "1.25rem",
                    marginBottom: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                    textAlign: "left"
                  }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span style={{ display: "flex", color: "#EF4444" }}><AlertTriangle size={24} /></span>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: "900", color: "#EF4444" }}>
                          Novedades de Recogida — Requiere Acción
                        </h4>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {novelties.filter(n => n.task_id === selectedTask.id).map((nov: any) => (
                        <div key={nov.id} style={{
                          backgroundColor: "var(--ops-surface)",
                          border: "1px solid var(--ops-border)",
                          borderRadius: "10px",
                          padding: "0.75rem",
                          fontSize: "0.8rem",
                          display: "grid",
                          gridTemplateColumns: nov.evidence_url ? "1fr 80px" : "1fr",
                          gap: "1rem",
                          alignItems: "center"
                        }}>
                          <div>
                            <div style={{ fontWeight: "bold", color: "#EF4444", textTransform: "uppercase" }}>
                              {nov.novelty_type === 'rejection' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={13} /> Compra Rechazada</span> : (nov.novelty_type === 'deficit' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={13} /> Faltante de Recogida</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Info size={13} /> Alerta Calidad</span>)} ({nov.quantity} {selectedTask.unit})
                            </div>
                            {nov.reason && (
                              <div style={{ fontSize: "0.75rem", color: "var(--ops-text-muted)", marginTop: "0.2rem" }}>
                                <strong>Motivo:</strong> {nov.reason}
                              </div>
                            )}
                          </div>
                          {nov.evidence_url && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                              <img
                                src={nov.evidence_url}
                                alt="Evidencia"
                                style={{ width: "80px", height: "60px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--ops-border)", cursor: "pointer" }}
                                onClick={() => window.open(nov.evidence_url, '_blank')}
                              />
                              <span
                                style={{ fontSize: "0.65rem", color: "var(--ops-primary)", cursor: "pointer", textDecoration: "underline" }}
                                onClick={() => window.open(nov.evidence_url, '_blank')}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Search size={11} /> Ampliar Foto</span>
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "grid", gap: "0.6rem" }}>
                      <button
                        onClick={async () => {
                          const firstNov = novelties.find(n => n.task_id === selectedTask.id);
                          if (!firstNov) return;
                          if (!confirm("¿Deseas reprogramar la recogida con este proveedor?")) return;
                          
                          // Resolve all novelties for this task
                          const taskNovs = novelties.filter(n => n.task_id === selectedTask.id);
                          for (const nov of taskNovs) {
                            await resolvePurchaseNovelty({ id: nov.purchase_id, task_id: selectedTask.id, ...nov }, 'reprogrammed');
                          }
                          
                          setSelectedProvider(firstNov.provider_id || "");
                          setQty(String(firstNov.quantity || ""));
                          setPurchaseUnit(firstNov.unit || "Kg");
                          setIsReprogramming(true);
                          
                          await supabase.from("procurement_tasks").update({ status: 'pending' }).eq("id", selectedTask.id);
                          
                          alert("Novedad resuelta como Reprogramada. El formulario se ha prellenado para re-intentar.");
                          fetchTasks();
                        }}
                        style={{
                          padding: "0.85rem", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)",
                          backgroundColor: "rgba(255, 255, 255, 0.05)", color: "#F8FAFC",
                          fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", textAlign: "left"
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Clock size={14} /> Reclamar al proveedor y programar nueva recogida</span>
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm("¿Deseas resolver comprando a otro proveedor?")) return;
                          const taskNovs = novelties.filter(n => n.task_id === selectedTask.id);
                          for (const nov of taskNovs) {
                            await resolvePurchaseNovelty({ id: nov.purchase_id, task_id: selectedTask.id, ...nov }, 'purchased_elsewhere');
                          }
                          
                          alert("Novedad resuelta. Procediendo a registrar compra con otro proveedor.");
                          fetchTasks();
                        }}
                        style={{
                          padding: "0.85rem", borderRadius: "10px", border: "1px solid rgba(245, 158, 11, 0.3)",
                          backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#F59E0B",
                          fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", textAlign: "left"
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><RefreshCw size={14} /> Descartar y generar nueva compra con otro proveedor</span>
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm("¿Deseas registrar una reclamación administrativa? La meta se ajustará a lo comprado.")) return;
                          const taskNovs = novelties.filter(n => n.task_id === selectedTask.id);
                          for (const nov of taskNovs) {
                            await resolvePurchaseNovelty({ id: nov.purchase_id, task_id: selectedTask.id, ...nov }, 'closed_with_shortfall');
                          }
                          
                          const { error } = await supabase
                            .from("procurement_tasks")
                            .update({
                              total_requested: selectedTask.total_purchased,
                              status: "completed"
                            })
                            .eq("id", selectedTask.id);
                          if (error) {
                            alert("Error actualizando la tarea: " + error.message);
                            return;
                          }

                          alert("💰 Reclamación administrativa registrada. Tarea completada.");
                          setSelectedTask(null);
                          resetForm();
                          fetchTasks();
                        }}
                        style={{
                          padding: "0.85rem", borderRadius: "10px", border: "1px solid rgba(239, 68, 68, 0.3)",
                          backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#EF4444",
                          fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", textAlign: "left"
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><AlertCircle size={14} /> Reclamación Administrativa (Nota Crédito / Saldo)</span>
                      </button>
                    </div>
                  </div>
                )}


                {/* Main purchase fields (Only show if no unresolved novelties OR in reprogramming/alternative purchase mode) */}
                {(novelties.filter(n => n.task_id === selectedTask.id).length === 0 || isReprogramming) && (
                  <>
                  <div>
                    <button
                      onClick={() => setIsSubstituting(true)}
                      style={{
                        marginTop: "0.2rem",
                        padding: "0.4rem 0.8rem",
                        border: "1px solid var(--ops-border)",
                        borderRadius: "6px",
                        backgroundColor: "rgba(0,0,0,0.03)",
                        color: "var(--ops-text-muted)",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        alignSelf: "flex-start",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><RefreshCw size={12} /> Sustituir Producto</span>
                    </button>
                  </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        color: "var(--ops-text-muted)",
                      }}
                    >
                      PROVEEDOR
                    </label>
                    <button
                      onClick={() => setIsQuickProvider(!isQuickProvider)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ops-primary)",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                      }}
                    >
                      {isQuickProvider
                        ? "← VOLVER A LISTA"
                        : "+ NUEVO PROVEEDOR"}
                    </button>
                  </div>

                  {!isQuickProvider ? (
                    <div style={{ position: "relative", width: "100%" }}>
                      {selectedProvider ? (
                        <div
                          onClick={() => {
                            setSelectedProvider("");
                            setProviderSearchText("");
                          }}
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "12px",
                            backgroundColor: "var(--ops-bg)",
                            border: "1px solid var(--ops-border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            minHeight: "48px"
                          }}
                        >
                          {(() => {
                            const prov = providers.find((p) => p.id === selectedProvider);
                            if (!prov) return <span style={{ color: "var(--ops-text-muted)" }}>Seleccionar proveedor...</span>;
                            return (
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <span style={{ color: "#10B981", fontWeight: "800", marginRight: "6px" }}>
                                  {prov.product ? prov.product.toUpperCase() : "PRODUCTO"}
                                </span>
                                <span style={{ color: "var(--ops-text)", opacity: 0.9 }}>
                                  - {prov.name}
                                </span>
                              </div>
                            );
                          })()}
                          <span style={{ color: "var(--ops-text-muted)", fontSize: "0.9rem", fontWeight: "bold", marginLeft: "10px" }}>
                            ✕
                          </span>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={providerSearchText}
                            onChange={(e) => {
                              setProviderSearchText(e.target.value);
                              setShowProviderDropdown(true);
                              setActiveOptionIndex(-1);
                              if (!e.target.value) {
                                setSelectedProvider("");
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!showProviderDropdown) {
                                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                  setShowProviderDropdown(true);
                                }
                                return;
                              }

                              const filtered = getFilteredProviders();
                              if (filtered.length === 0) return;

                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setActiveOptionIndex((prev) => {
                                  const next = prev + 1;
                                  return next >= filtered.length ? 0 : next;
                                });
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setActiveOptionIndex((prev) => {
                                  const next = prev - 1;
                                  return next < 0 ? filtered.length - 1 : next;
                                });
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (activeOptionIndex >= 0 && activeOptionIndex < filtered.length) {
                                  const p = filtered[activeOptionIndex];
                                  setSelectedProvider(p.id);
                                  setProviderSearchText(`${p.product ? p.product.toUpperCase() : "PRODUCTO"} - ${p.name}`);
                                  setShowProviderDropdown(false);
                                  setActiveOptionIndex(-1);
                                }
                              } else if (e.key === "Escape") {
                                setShowProviderDropdown(false);
                                setActiveOptionIndex(-1);
                              }
                            }}
                            onFocus={() => {
                              setShowProviderDropdown(true);
                              setActiveOptionIndex(-1);
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setShowProviderDropdown(false);
                                setActiveOptionIndex(-1);
                              }, 250);
                            }}
                            placeholder="Buscar por producto o proveedor..."
                            style={{
                              width: "100%",
                              padding: "1rem",
                              borderRadius: "12px",
                              backgroundColor: "var(--ops-bg)",
                              border: "1px solid var(--ops-border)",
                              color: "var(--ops-text)",
                              fontSize: "0.85rem"
                        }}
                      />
                      <span style={{
                        position: "absolute",
                        right: "1rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                        color: "var(--ops-text-muted)",
                        fontSize: "0.9rem"
                      }}>
                        <Search size={16} />
                      </span>

                      {showProviderDropdown && (
                        <div style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: "4px",
                          backgroundColor: "var(--ops-surface)",
                          border: "1px solid var(--ops-border)",
                          borderRadius: "12px",
                          maxHeight: "360px",
                          overflowY: "auto",
                          zIndex: 100,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)"
                        }}>
                          {(() => {
                            const filtered = getFilteredProviders();

                            if (filtered.length === 0) {
                              return (
                                <div style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--ops-text-muted)", textAlign: "center" }}>
                                  No se encontraron proveedores
                                </div>
                              );
                            }

                            return filtered.map((p, idx) => (
                              <div
                                key={p.id}
                                onMouseDown={() => {
                                  setSelectedProvider(p.id);
                                  setProviderSearchText(`${p.product ? p.product.toUpperCase() : "PRODUCTO"} - ${p.name}`);
                                  setShowProviderDropdown(false);
                                }}
                                style={{
                                  padding: "0.8rem 1rem",
                                  cursor: "pointer",
                                  fontSize: "0.8rem",
                                  display: "flex",
                                  justifyContent: "flex-start",
                                  alignItems: "center",
                                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                                  backgroundColor: activeOptionIndex === idx 
                                    ? "rgba(255, 255, 255, 0.08)" 
                                    : (selectedProvider === p.id ? "rgba(16, 185, 129, 0.15)" : "transparent"),
                                  transition: "background-color 0.15s ease"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                                  setActiveOptionIndex(idx);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = selectedProvider === p.id ? "rgba(16, 185, 129, 0.15)" : "transparent";
                                }}
                              >
                                <span style={{ color: "#10B981", fontWeight: "800", marginRight: "6px" }}>
                                  {p.product ? p.product.toUpperCase() : "PRODUCTO"}
                                </span>
                                <span style={{ color: "var(--ops-text)", opacity: 0.9 }}>
                                  - {p.name}
                                </span>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <input
                        type="text"
                        value={newProviderName}
                        onChange={(e) => setNewProviderName(e.target.value)}
                        placeholder="Nombre del proveedor (ej: Frutas Doña María)"
                        style={{
                          width: "100%",
                          padding: "1rem",
                          borderRadius: "12px",
                          backgroundColor: "var(--ops-bg)",
                          border: "1px solid var(--ops-border)",
                          color: "var(--ops-text)",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <input
                          type="text"
                          value={newProviderTaxId}
                          onChange={(e) => setNewProviderTaxId(e.target.value)}
                          placeholder="NIT / Cédula"
                          style={{
                            flex: 1,
                            padding: "1rem",
                            borderRadius: "12px",
                            backgroundColor: "var(--ops-bg)",
                            border: "1px solid var(--ops-border)",
                            color: "var(--ops-text)",
                          }}
                        />
                        <input
                          type="tel"
                          value={newProviderPhone}
                          onChange={(e) => setNewProviderPhone(e.target.value)}
                          placeholder="Teléfono"
                          style={{
                            flex: 1,
                            padding: "1rem",
                            borderRadius: "12px",
                            backgroundColor: "var(--ops-bg)",
                            border: "1px solid var(--ops-border)",
                            color: "var(--ops-text)",
                          }}
                        />
                      </div>
                      <input
                        type="text"
                        value={newProviderLoc}
                        onChange={(e) => setNewProviderLoc(e.target.value)}
                        placeholder="Pasillo / Bodega (ej: Pasillo 2)"
                        style={{
                          width: "100%",
                          padding: "1rem",
                          borderRadius: "12px",
                          backgroundColor: "var(--ops-bg)",
                          border: "1px solid var(--ops-border)",
                          color: "var(--ops-text)",
                        }}
                      />
                      <input 
                        type="email"
                        value={newProviderEmail}
                        onChange={(e) => setNewProviderEmail(e.target.value)}
                        placeholder="Correo Electrónico (opcional)"
                        style={{
                          width: "100%",
                          padding: "1rem",
                          borderRadius: "12px",
                          backgroundColor: "var(--ops-bg)",
                          border: "1px solid var(--ops-border)",
                          color: "var(--ops-text)",
                        }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "1rem" }}>
                  <div style={{ flex: 1.2 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        marginBottom: "0.5rem",
                        color: "var(--ops-text-muted)",
                      }}
                    >
                      CANTIDAD
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: "var(--ops-bg)",
                        borderRadius: "12px",
                        border: "1px solid var(--ops-border)",
                        overflow: "hidden",
                      }}
                    >
                      <input
                        type="number"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        placeholder="50"
                        style={{
                          flex: 1,
                          padding: "1rem",
                          border: "none",
                          background: "transparent",
                          color: "var(--ops-text)",
                          outline: "none",
                        }}
                      />
                      <select
                        value={purchaseUnit}
                        onChange={(e) => setPurchaseUnit(e.target.value)}
                        style={{
                          padding: "1rem 0.5rem",
                          background: "transparent",
                          border: "none",
                          color: "var(--ops-text)",
                          fontWeight: "bold",
                          outline: "none",
                        }}
                      >
                        <option
                          style={{ color: "black", backgroundColor: "white" }}
                          value="Kg"
                        >
                          Kg
                        </option>
                        <option
                          style={{ color: "black", backgroundColor: "white" }}
                          value="Bulto"
                        >
                          Bulto
                        </option>
                        <option
                          style={{ color: "black", backgroundColor: "white" }}
                          value="Caja"
                        >
                          Caja
                        </option>
                        <option
                          style={{ color: "black", backgroundColor: "white" }}
                          value="Canastilla"
                        >
                          Canas.
                        </option>
                        <option
                          style={{ color: "black", backgroundColor: "white" }}
                          value="Unidad"
                        >
                          Und
                        </option>
                      </select>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        marginBottom: "0.5rem",
                        color: "var(--ops-text-muted)",
                      }}
                    >
                      PRECIO UNIT.
                    </label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="5000"
                      style={{
                        width: "100%",
                        padding: "1rem",
                        borderRadius: "12px",
                        backgroundColor: "var(--ops-bg)",
                        border: "1px solid var(--ops-border)",
                        color: "var(--ops-text)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      marginBottom: "0.5rem",
                      color: "var(--ops-primary)",
                    }}
                  >
                    HORA DE RECOGIDA *
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: "0.5rem",
                    }}
                  >
                    {[
                      { label: "YA", value: 0 },
                      { label: "30m", value: 30 },
                      { label: "1h", value: 60 },
                      { label: "2h", value: 120 },
                      { label: "+2h", value: 240 },
                    ].map((time) => (
                      <button
                        key={time.label}
                        style={{
                          padding: "0.8rem 0.2rem",
                          borderRadius: "8px",
                          border: `1px solid ${pickupTimeMinutes === time.value ? "var(--ops-primary)" : "var(--ops-border)"}`,
                          backgroundColor:
                            pickupTimeMinutes === time.value
                              ? "rgba(16, 185, 129, 0.1)"
                              : "transparent",
                          color:
                            pickupTimeMinutes === time.value
                              ? "var(--ops-primary)"
                              : "var(--ops-text)",
                          fontSize: "0.8rem",
                          fontWeight: "700",
                        }}
                        onClick={() => setPickupTimeMinutes(time.value)}
                      >
                        {time.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        color: "var(--ops-text-muted)",
                      }}
                    >
                      UBICACIÓN DE RECOGIDA (OPCIONAL)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLocationContingency(!showLocationContingency)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: showLocationContingency ? "var(--ops-primary)" : "var(--ops-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "6px",
                        backgroundColor: showLocationContingency ? "rgba(8, 145, 178, 0.1)" : "transparent",
                      }}
                      title="Ingresar ubicación excepcional"
                    >
                      <Pencil size={12} style={{ display: 'inline-flex', alignItems: 'center' }} /> {showLocationContingency ? "Ocultar" : "Excepcional"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ej: Bodega 4, Puesto 12"
                    style={{
                      width: "100%",
                      padding: "1rem",
                      borderRadius: "12px",
                      backgroundColor: "var(--ops-bg)",
                      border: "1px solid var(--ops-border)",
                      color: "var(--ops-text)",
                      fontSize: "0.85rem",
                    }}
                  />
                  {showLocationContingency && (
                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", padding: "0.75rem", backgroundColor: "var(--ops-surface)", borderRadius: "12px", border: "1px dashed var(--ops-border)" }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--ops-text-muted)", fontWeight: "600" }}>BODEGA</span>
                        <input
                          list="bodegas-list"
                          value={contingencyBodega}
                          onChange={(e) => {
                            setContingencyBodega(e.target.value);
                            const newBodega = e.target.value ? `Bodega: ${e.target.value}` : "";
                            const currentPuesto = contingencyPuesto ? `Puesto: ${contingencyPuesto}` : "";
                            setLocation([newBodega, currentPuesto].filter(Boolean).join(", "));
                          }}
                          placeholder="Elegir o escribir..."
                          style={{
                            width: "100%",
                            padding: "0.6rem 0.8rem",
                            borderRadius: "8px",
                            border: "1px solid var(--ops-border)",
                            fontSize: "0.8rem",
                            outline: "none",
                            backgroundColor: "var(--ops-bg)",
                            color: "var(--ops-text)",
                          }}
                        />
                        <datalist id="bodegas-list">
                          {availableBodegas.map(b => <option key={b} value={b} />)}
                        </datalist>
                      </div>

                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--ops-text-muted)", fontWeight: "600" }}>PUESTO</span>
                        <input
                          list="puestos-list"
                          value={contingencyPuesto}
                          onChange={(e) => {
                            setContingencyPuesto(e.target.value);
                            const currentBodega = contingencyBodega ? `Bodega: ${contingencyBodega}` : "";
                            const newPuesto = e.target.value ? `Puesto: ${e.target.value}` : "";
                            setLocation([currentBodega, newPuesto].filter(Boolean).join(", "));
                          }}
                          placeholder="Elegir o escribir..."
                          style={{
                            width: "100%",
                            padding: "0.6rem 0.8rem",
                            borderRadius: "8px",
                            border: "1px solid var(--ops-border)",
                            fontSize: "0.8rem",
                            outline: "none",
                            backgroundColor: "var(--ops-bg)",
                            color: "var(--ops-text)",
                          }}
                        />
                        <datalist id="puestos-list">
                          {availablePuestos.map(p => <option key={p} value={p} />)}
                        </datalist>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      marginBottom: "0.5rem",
                      color: "var(--ops-primary)",
                    }}
                  >
                    EVIDENCIA (FOTO OBLIGATORIA *)
                  </label>
                  <input
                    type="file"
                    id="voucherInput"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />
                  <div
                    onClick={() =>
                      document.getElementById("voucherInput")?.click()
                    }
                    style={{
                      width: "100%",
                      minHeight: voucherPreview ? "240px" : "120px",
                      borderRadius: "12px",
                      backgroundColor: "var(--ops-bg)",
                      border: "2px dashed var(--ops-border)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ops-text-muted)",
                      cursor: "pointer",
                      overflow: "hidden",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {voucherPreview ? (
                      <img
                        src={voucherPreview}
                        alt="Preview"
                        style={{
                          width: "100%",
                          height: "100%",
                          maxHeight: "350px",
                          objectFit: "contain",
                          backgroundColor: "#000",
                          borderRadius: "10px"
                        }}
                      />
                    ) : (
                      <>
                        <span style={{ color: "var(--ops-primary)", marginBottom: "8px" }}><Camera size={28} strokeWidth={1.5} /></span>
                        <span style={{ fontSize: "0.7rem" }}>
                          TOCAR PARA TOMAR FOTO
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {formError && (
                  <div
                    style={{
                      padding: "0.8rem",
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      borderRadius: "8px",
                      color: "#B91C1C",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <span>🚫</span> {formError}
                  </div>
                )}

                <button
                  onClick={handleSavePurchase}
                  disabled={submitting || uploadingImage}
                  style={{
                    width: "100%",
                    padding: "1.2rem",
                    borderRadius: "12px",
                    backgroundColor: "var(--ops-primary)",
                    color: "white",
                    border: "none",
                    fontWeight: "bold",
                    fontSize: "1.1rem",
                    marginTop: "0.5rem",
                    boxShadow: "0 4px 6px rgba(16, 185, 129, 0.2)",
                    opacity: submitting || uploadingImage ? 0.6 : 1,
                  }}
                >
                  {uploadingImage
                    ? "SUBIENDO FOTO..."
                    : submitting
                      ? "GUARDANDO..."
                      : "REGISTRAR COMPRA"}
                </button>
                </>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                <p
                  style={{
                    color: "#FBBF24",
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                  }}
                >
                  Buscar alternativa:
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    value={searchSub}
                    onChange={(e) => setSearchSub(e.target.value)}
                    placeholder="Nombre del producto..."
                    style={{
                      flex: 1,
                      padding: "0.75rem",
                      borderRadius: "8px",
                      backgroundColor: "var(--ops-bg)",
                      border: "1px solid var(--ops-border)",
                      color: "var(--ops-text)",
                    }}
                  />
                  <button
                    onClick={handleSubSearch}
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "var(--ops-primary)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                    }}
                  >
                    <Search size={16} />
                  </button>
                </div>

                {subResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => confirmSubstitution(p)}
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "var(--ops-bg)",
                      borderRadius: "8px",
                      border: "1px solid var(--ops-border)",
                    }}
                  >
                    <div style={{ fontWeight: "bold" }}>{p.name}</div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--ops-text-muted)",
                      }}
                    >
                      {p.category} - {p.unit_of_measure}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setIsSubstituting(false)}
                  style={{
                    marginTop: "1rem",
                    background: "none",
                    border: "none",
                    color: "var(--ops-text-muted)",
                    fontSize: "0.8rem",
                  }}
                >
                  ← Volver sin cambios
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onboarding Guide Modal (Carrusel del Profesor) */}
      {showGuide && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
          animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
            @keyframes float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-8px); }
            }
            @keyframes pulse-glow {
              0%, 100% { transform: scale(1); opacity: 0.6; }
              50% { transform: scale(1.05); opacity: 1; }
            }
            @keyframes dash {
              to {
                stroke-dashoffset: -20;
              }
            }
            @keyframes modalEntrance {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-float { animation: float 3s ease-in-out infinite; }
            .animate-float-delayed { animation: float 3s ease-in-out infinite; animation-delay: 1.5s; }
            .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
            .animate-dash { stroke-dasharray: 6; animation: dash 1.5s linear infinite; }
            .modal-content-card {
              animation: modalEntrance 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
          `}} />

          <div 
            className="modal-content-card"
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '28px',
              width: '100%',
              maxWidth: '460px',
              padding: '2.2rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
              color: '#F8FAFC',
              position: 'relative'
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowGuide(false)}
              style={{
                position: 'absolute', top: '1.25rem', right: '1.25rem',
                width: '32px', height: '32px', borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: 'none', color: '#94A3B8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s ease',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.color = '#EF4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#94A3B8';
              }}
            >
              ✕
            </button>

            {/* Step Content */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              
              {/* Animated Illustration Area */}
              <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', width: '100%' }}>
                {guideStep === 0 && (
                  <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                    <defs>
                      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <circle cx="60" cy="65" r="45" fill="url(#glow)" className="animate-pulse-glow" />
                    <rect x="35" y="40" width="50" height="45" rx="8" fill="none" stroke="#10B981" strokeWidth="3" />
                    <line x1="35" y1="52" x2="85" y2="52" stroke="#10B981" strokeWidth="2" />
                    <circle cx="50" cy="65" r="4" fill="#3B82F6" />
                    <circle cx="70" cy="65" r="4" fill="#3B82F6" />
                    <path d="M 52 74 Q 60 79 68 74" stroke="#F59E0B" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d="M 60 20 L 60 30" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="60" cy="16" r="3" fill="#10B981" />
                  </svg>
                )}
                {guideStep === 1 && (
                  <svg width="180" height="120" viewBox="0 0 180 120">
                    <rect x="10" y="40" width="45" height="30" rx="6" fill="none" stroke="#64748B" strokeWidth="2" />
                    <text x="32" y="59" fill="#94A3B8" fontSize="10" fontWeight="bold" textAnchor="middle">PED</text>
                    <line x1="55" y1="55" x2="68" y2="55" stroke="#3B82F6" strokeWidth="2" className="animate-dash" />
                    
                    <rect x="68" y="40" width="45" height="30" rx="6" fill="none" stroke="#F59E0B" strokeWidth="2" />
                    <text x="90" y="59" fill="#F59E0B" fontSize="9" fontWeight="bold" textAnchor="middle">STOCK</text>
                    <line x1="113" y1="55" x2="125" y2="55" stroke="#3B82F6" strokeWidth="2" className="animate-dash" />
                    
                    <rect x="125" y="40" width="45" height="30" rx="6" fill="none" stroke="#10B981" strokeWidth="2" />
                    <text x="147" y="59" fill="#10B981" fontSize="10" fontWeight="bold" textAnchor="middle">META</text>
                    
                    <path d="M 90 20 L 90 40" stroke="#EF4444" strokeWidth="2" strokeDasharray="3" />
                    <text x="90" y="15" fill="#EF4444" fontSize="10" textAnchor="middle">Neteo</text>
                  </svg>
                )}
                {guideStep === 2 && (
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="30" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="60" cy="35" r="12" fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth="2" className="animate-pulse-glow" />
                    <circle cx="60" cy="35" r="4" fill="#EF4444" />
                    <circle cx="35" cy="75" r="12" fill="rgba(245, 158, 11, 0.2)" stroke="#F59E0B" strokeWidth="2" style={{ animation: 'pulse-glow 2s infinite', animationDelay: '0.6s' }} />
                    <circle cx="35" cy="75" r="4" fill="#F59E0B" />
                    <circle cx="85" cy="75" r="12" fill="rgba(234, 179, 8, 0.2)" stroke="#EAB308" strokeWidth="2" style={{ animation: 'pulse-glow 2s infinite', animationDelay: '1.2s' }} />
                    <circle cx="85" cy="75" r="4" fill="#EAB308" />
                  </svg>
                )}
                {guideStep === 3 && (
                  <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                    <path d="M 70 20 L 40 60 L 60 60 L 50 100 L 80 50 L 60 50 Z" fill="#F59E0B" className="animate-pulse-glow" style={{ transformOrigin: 'center' }} />
                    <circle cx="60" cy="60" r="40" fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="4 8" className="animate-dash" />
                  </svg>
                )}
                {guideStep === 4 && (
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="40" fill="none" stroke="#10B981" strokeWidth="3" />
                    <path d="M 45 60 L 55 70 L 80 45" fill="none" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="60" cy="60" r="48" fill="none" stroke="#3B82F6" strokeWidth="1" strokeDasharray="3 6" className="animate-dash" />
                  </svg>
                )}
              </div>

              {/* Title */}
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '900', color: '#FFFFFF' }}>
                {guideStep === 0 && "¡Bienvenido a Compras!"}
                {guideStep === 1 && "Fórmula de Neteo Inteligente"}
                {guideStep === 2 && "Semáforo y Burbuja de Alertas"}
                {guideStep === 3 && "Acciones Rápidas (⚡ / 🏁)"}
                {guideStep === 4 && "Resolución de Novedades"}
              </h4>

              {/* Description */}
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', lineHeight: '1.5', minHeight: '60px' }}>
                {guideStep === 0 && "Esta interfaz te permite ver qué productos comprar para mañana de acuerdo a la demanda real consolidada. Se calcula cruzando stock, pedidos y existencias de seguridad."}
                {guideStep === 1 && "La meta neta se calcula restando el stock de bodega de forma secuencial. El stock mínimo de seguridad se añade únicamente a la primera variante del producto para no duplicar compras."}
                {guideStep === 2 && "Las devoluciones 🔴, faltantes 🟠 y advertencias de calidad 🟡 se propagan automáticamente aquí y elevan la tarjeta al inicio para que tomes acción inmediata sin demoras."}
                {guideStep === 3 && "Usa el botón ⚡ para comprar al instante con tu último proveedor usando memoria inteligente. Usa 🏁 para cerrar la meta si hay una entrega parcial aceptada."}
                {guideStep === 4 && "Cuando hay una novedad, el formulario se bloquea temporalmente. Elige reprogramar la recogida, comprar a otro proveedor, o aceptar la entrega parcial cerrando la brecha."}
              </p>

              {/* Progress Dots */}
              <div style={{ display: 'flex', gap: '0.5rem', margin: '1.5rem 0' }}>
                {[0, 1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    onClick={() => setGuideStep(step)}
                    style={{
                      width: guideStep === step ? '20px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: guideStep === step ? 'var(--ops-primary)' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                ))}
              </div>

              {/* Navigation Buttons */}
              <div style={{ display: 'flex', width: '100%', gap: '0.75rem', marginTop: '0.5rem' }}>
                {guideStep > 0 ? (
                  <button
                    onClick={() => setGuideStep(prev => prev - 1)}
                    style={{
                      flex: 1, padding: '0.75rem', borderRadius: '12px',
                      backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#F8FAFC', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Atrás
                  </button>
                ) : (
                  <div style={{ flex: 1 }} />
                )}

                {guideStep < 4 ? (
                  <button
                    onClick={() => setGuideStep(prev => prev + 1)}
                    style={{
                      flex: 2, padding: '0.75rem', borderRadius: '12px',
                      backgroundColor: 'var(--ops-primary)', border: 'none',
                      color: 'white', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                    }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    onClick={() => setShowGuide(false)}
                    style={{
                      flex: 2, padding: '0.75rem', borderRadius: '12px',
                      backgroundColor: 'var(--ops-primary)', border: 'none',
                      color: 'white', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                    }}
                  >
                    Comenzar 🚀
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
