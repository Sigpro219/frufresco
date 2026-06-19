'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, ShieldAlert, CheckSquare, Square, MinusSquare } from 'lucide-react';

export interface TreeNode {
  id: string;
  label: string;
  level: 1 | 2 | 3 | 4;
  children?: TreeNode[];
}

export const permissionTree: TreeNode[] = [
  {
    id: 'admin',
    label: '1. Portal Administrador (Global)',
    level: 1,
    children: [
      {
        id: 'admin.dashboard',
        label: '1.1 Centro de Comando / Gobernanza',
        level: 2,
        children: [
          {
            id: 'admin.products.catalog',
            label: '1.1.1 Catálogo Web (Precios B2C)',
            level: 3,
            children: [
              { id: 'admin.products.catalog.view', label: '1.1.1.1 Visualizar Catálogo', level: 4 },
              { id: 'admin.products.catalog.edit', label: '1.1.1.2 Modificar Precios y Catálogo', level: 4 }
            ]
          },
          {
            id: 'admin.products.master',
            label: '1.1.2 Maestro SKU (Datos Técnicos)',
            level: 3,
            children: [
              { id: 'admin.products.master.view', label: '1.1.2.1 Visualizar SKU y Ficha Técnica', level: 4 },
              { id: 'admin.products.master.edit', label: '1.1.2.2 Crear y Editar SKU', level: 4 }
            ]
          },
          {
            id: 'admin.clients',
            label: '1.1.3 Clientes (CRM y Aprobación)',
            level: 3,
            children: [
              { id: 'admin.clients.view', label: '1.1.3.1 Visualizar Clientes y CRM', level: 4 },
              { id: 'admin.clients.edit', label: '1.1.3.2 Crear, Editar y Aprobar Clientes', level: 4 }
            ]
          },
          {
            id: 'admin.procurement.providers',
            label: '1.1.4 Maestro de Proveedores',
            level: 3,
            children: [
              { id: 'admin.procurement.providers.view', label: '1.1.4.1 Visualizar Proveedores', level: 4 },
              { id: 'admin.procurement.providers.edit', label: '1.1.4.2 Crear y Modificar Ficha de Proveedor', level: 4 }
            ]
          },
          {
            id: 'admin.dashboard.settings',
            label: '1.1.5 Parámetros Globales (Cutoff)',
            level: 3,
            children: [
              { id: 'admin.dashboard.settings.view', label: '1.1.5.1 Visualizar Configuración de Corte', level: 4 },
              { id: 'admin.dashboard.settings.edit', label: '1.1.5.2 Modificar Reglas de Cutoff', level: 4 }
            ]
          },
          { id: 'admin.dashboard.audit', label: '1.1.6 Logs de Auditoría de Datos', level: 3 }
        ]
      },
      {
        id: 'admin.orders',
        label: '1.2 Pedidos y Rutas de Despacho',
        level: 2,
        children: [
          { id: 'admin.orders.history', label: '1.2.1 Historial y Monitoreo de Órdenes', level: 3 },
          { id: 'admin.orders.create', label: '1.2.2 Nuevo Pedido Manual', level: 3 },
          { id: 'admin.orders.loading', label: '1.2.3 Cargue de Pedidos', level: 3 }
        ]
      },
      {
        id: 'admin.commercial',
        label: '1.3 Comercial y Facturación',
        level: 2,
        children: [
          { id: 'admin.commercial.quotes', label: '1.3.1 Cotizaciones y Ofertas (B2B)', level: 3 },
          { id: 'admin.commercial.agreements', label: '1.3.2 Acuerdos y Listas de Precios', level: 3 },
          { id: 'admin.commercial.cost-matrix', label: '1.3.3 Matriz de Costos y Rentabilidad', level: 3 },
          { id: 'admin.commercial.campaigns', label: '1.3.4 Campañas de Mercadeo (Alzas/Bajas)', level: 3 },
          {
            id: 'admin.commercial.billing',
            label: '1.3.5 Facturación y Cartera (Finanzas)',
            level: 3,
            children: [
              { id: 'admin.commercial.billing.invoicing', label: '1.3.5.1 Facturación (Cortes y Devoluciones)', level: 4 },
              { id: 'admin.commercial.billing.portfolio', label: '1.3.5.2 Cartera y Solicitudes de Crédito', level: 4 },
              { id: 'admin.commercial.billing.config', label: '1.3.5.3 Configuración y Roles de Crédito', level: 4 }
            ]
          },
          {
            id: 'admin.commercial.inventory',
            label: '1.3.6 Control de Inventarios (Stocks)',
            level: 3,
            children: [
              { id: 'admin.commercial.inventory.stock', label: '1.3.6.1 Stock en Tiempo Real', level: 4 },
              { id: 'admin.commercial.inventory.movements', label: '1.3.6.2 Kardex y Movimientos de Stock', level: 4 },
              { id: 'admin.commercial.inventory.random_tasks', label: '1.3.6.3 Auditorías y Conteos Cíclicos', level: 4 },
              { id: 'admin.commercial.inventory.novedades', label: '1.3.6.4 Bitácora de Incidencias de Piso', level: 4 }
            ]
          }
        ]
      },
      {
        id: 'admin.procurement',
        label: '1.4 Gestión de Compras (Abastecimiento Admin)',
        level: 2,
        children: [
          { id: 'admin.procurement.treasury', label: '1.4.1 Conciliación Bancaria y Aprobación', level: 3 },
          { id: 'admin.procurement.cash', label: '1.4.2 Caja Menor (Compras de Contado y Gastos)', level: 3 },
          { id: 'admin.procurement.export', label: '1.4.3 Exportador Contable (WorldOffice)', level: 3 },
          { id: 'admin.procurement.expenses', label: '1.4.4 Histórico de Gastos Operativos', level: 3 }
        ]
      },
      {
        id: 'admin.transport',
        label: '1.5 Torre de Control de Logística',
        level: 2,
        children: [
          { id: 'admin.transport.view', label: '1.5.1 Visualizar Torre de Control (Lectura)', level: 3 },
          { id: 'admin.transport.edit', label: '1.5.2 Operar y Modificar Logística (Escritura)', level: 3 }
        ]
      },
      {
        id: 'admin.hr',
        label: '1.6 Talento Humano y Colaboradores',
        level: 2
      },
      {
        id: 'admin.customer-service',
        label: '1.7 Atención al Cliente (PQRs)',
        level: 2
      },
      {
        id: 'admin.strategy',
        label: '1.8 Inteligencia & Estrategia',
        level: 2
      }
    ]
  },
  {
    id: 'ops',
    label: '2. Portal Operacional (FruFresco OPS)',
    level: 1,
    children: [
      {
        id: 'ops.compras',
        label: '2.1 Compras (Abastecimiento)',
        level: 2,
        children: [
          { id: 'ops.compras.category:DESPENSA', label: '2.1.1 Categoría: Despensa', level: 4 },
          { id: 'ops.compras.category:FRUTA SELECCIONADA', label: '2.1.2 Categoría: Fruta Seleccionada', level: 4 },
          { id: 'ops.compras.category:HORTALIZA SELECCIONADA', label: '2.1.3 Categoría: Hortaliza Seleccionada', level: 4 },
          { id: 'ops.compras.category:PLATANOS', label: '2.1.4 Categoría: Plátanos', level: 4 },
          { id: 'ops.compras.category:TOMATE', label: '2.1.5 Categoría: Tomate', level: 4 },
          { id: 'ops.compras.category:TUBERCULOS - PAPA', label: '2.1.6 Categoría: Tubérculos / Papa', level: 4 },
          { id: 'ops.compras.category:VERDURAS', label: '2.1.7 Categoría: Verduras', level: 4 }
        ]
      },
      {
        id: 'ops.recogida',
        label: '2.2 Recogida Zorritos (Abastos)',
        level: 2,
        children: [
          { id: 'ops.recogida.category:FRUTAS', label: '2.2.1 Sección: Frutas', level: 4 },
          { id: 'ops.recogida.category:OTROS', label: '2.2.2 Sección: Otros', level: 4 }
        ]
      },
      {
        id: 'ops.recepcion',
        label: '2.3 Recepción (Bodega Principal)',
        level: 2,
        children: [
          { id: 'ops.recepcion.category:ABARROTES & LÁCTEOS', label: '2.3.1 Mesa: Abarrotes & Lácteos', level: 4 },
          { id: 'ops.recepcion.category:FRUTAS', label: '2.3.2 Mesa: Frutas', level: 4 },
          { id: 'ops.recepcion.category:HORTALIZAS', label: '2.3.3 Mesa: Hortalizas', level: 4 },
          { id: 'ops.recepcion.category:PAPAS, PLÁTANO, TOMATE', label: '2.3.4 Mesa: Papas, Plátano, Tomate', level: 4 },
          { id: 'ops.recepcion.category:VERDURAS', label: '2.3.5 Mesa: Verduras', level: 4 }
        ]
      },
      {
        id: 'ops.recepcion.supervisor',
        label: '2.4 Supervisión de Cuarentena y Mermas',
        level: 2
      },
      {
        id: 'ops.picking',
        label: '2.5 Alistamiento (Picking)',
        level: 2,
        children: [
          { id: 'ops.picking.terminal', label: '2.5.1 Terminal de Alistamiento (Básculas)', level: 3 },
          { id: 'ops.picking.dashboard', label: '2.5.2 Tablero de Eficiencia del Equipo', level: 3 },
          { id: 'ops.picking.category:AGUACATES', label: '2.5.3 Mesa: Aguacates', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO ABARROTES', label: '2.5.4 Mesa: Abarrotes', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO BATAVIA', label: '2.5.5 Mesa: Batavia', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO EN SECO PAPAS', label: '2.5.6 Mesa: Seco Papas', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO EN SECO PLATANOS', label: '2.5.7 Mesa: Seco Plátanos', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO EN SECO TOMATE', label: '2.5.8 Mesa: Seco Tomate', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO FRUTOS SECOS', label: '2.5.9 Mesa: Frutos Secos', level: 4 },
          { id: 'ops.picking.category:ALISTAMIENTO PROCESADOS', label: '2.5.10 Mesa: Procesados', level: 4 },
          { id: 'ops.picking.category:EQUIPO A VEGETALES', label: '2.5.11 Mesa: Equipo A Vegetales', level: 4 },
          { id: 'ops.picking.category:EQUIPO B FRUTAS Y OTROS', label: '2.5.12 Mesa: Equipo B Frutas', level: 4 },
          { id: 'ops.picking.category:FRESAS Y MORA', label: '2.5.13 Mesa: Fresas y Mora', level: 4 },
          { id: 'ops.picking.category:FRUTA BAJA DEMANDA', label: '2.5.14 Mesa: Fruta Baja Demanda', level: 4 },
          { id: 'ops.picking.category:HIERBAS Y HORTALIZAS', label: '2.5.15 Mesa: Hierbas y Hortalizas', level: 4 },
          { id: 'ops.picking.category:LACTEOS Y REFRIGERADOS', label: '2.5.16 Mesa: Lácteos y Refrigerados', level: 4 },
          { id: 'ops.picking.category:LAVADO, BATAVIA, ARRACACHA, CEBOLLA LARGA Y PEPINO', label: '2.5.17 Mesa: Lavado / Cebolla / Pepino', level: 4 }
        ]
      },
      {
        id: 'ops.driver',
        label: '2.6 Despacho (Conductores)',
        level: 2
      },
      {
        id: 'ops.inventory',
        label: '2.7 Cierre y Auditoría de Inventario de Piso',
        level: 2
      }
    ]
  },
  {
    id: 'b2b',
    label: '3. Portal Institucional (B2B)',
    level: 1,
    children: [
      {
        id: 'b2b.register',
        label: '3.1 Registro y Creación de Cuentas B2B',
        level: 2
      },
      {
        id: 'b2b.dashboard',
        label: '3.2 Panel de Cliente B2B',
        level: 2,
        children: [
          { id: 'b2b.dashboard.order', label: '3.2.1 Creación de Pedido y Catálogo', level: 3 },
          { id: 'b2b.dashboard.invoices', label: '3.2.2 Consulta de Facturas y Saldos', level: 3 },
          { id: 'b2b.dashboard.consumption', label: '3.2.3 Estadísticas de Consumo Histórico', level: 3 },
          { id: 'b2b.dashboard.agreements', label: '3.2.4 Acuerdos Comerciales y Contratos', level: 3 }
        ]
      }
    ]
  }
];

interface PermissionTreeEditorProps {
  initialPermissions: string[];
  onChange: (permissions: string[]) => void;
}

export default function PermissionTreeEditor({ initialPermissions, onChange }: PermissionTreeEditorProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['admin', 'ops', 'b2b']));

  useEffect(() => {
    // Clean and normalize incoming permissions
    const normalized = (initialPermissions || []).map(p => p.trim()).filter(Boolean);
    setSelectedKeys(new Set(normalized));
  }, [initialPermissions]);

  const isAllAccess = selectedKeys.has('*');

  const handleToggleAllAccess = () => {
    const next = new Set<string>();
    if (isAllAccess) {
      setSelectedKeys(next);
      onChange([]);
    } else {
      next.add('*');
      setSelectedKeys(next);
      onChange(['*']);
    }
  };

  // Recursively fetch all descendant IDs for a node
  const getDescendantIds = (node: TreeNode): string[] => {
    let ids: string[] = [node.id];
    if (node.children) {
      node.children.forEach(child => {
        ids = ids.concat(getDescendantIds(child));
      });
    }
    return ids;
  };

  // Find all ancestor IDs for a node (upward traversal path)
  const findAncestors = (tree: TreeNode[], targetId: string, path: string[] = []): string[] | null => {
    for (const node of tree) {
      if (node.id === targetId) {
        return path;
      }
      if (node.children) {
        const found = findAncestors(node.children, targetId, [...path, node.id]);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper to check if a node is fully selected
  const isChecked = (node: TreeNode): boolean => {
    if (selectedKeys.has(node.id) || selectedKeys.has('*')) return true;
    if (node.children && node.children.length > 0) {
      return node.children.every(child => isChecked(child));
    }
    return false;
  };

  // Helper to check if a node is indeterminately selected
  const isIndeterminate = (node: TreeNode): boolean => {
    if (selectedKeys.has(node.id) || selectedKeys.has('*')) return false;
    if (node.children && node.children.length > 0) {
      const someChecked = node.children.some(child => isChecked(child) || isIndeterminate(child));
      const allChecked = node.children.every(child => isChecked(child));
      return someChecked && !allChecked;
    }
    return false;
  };

  const toggleExpand = (nodeId: string) => {
    const next = new Set(expandedKeys);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    setExpandedKeys(next);
  };

  const handleCheckboxClick = (node: TreeNode) => {
    const nextSelected = new Set(selectedKeys);
    const nodeChecked = isChecked(node);
    const descendants = getDescendantIds(node);

    if (nodeChecked) {
      // Uncheck this node and all descendants
      descendants.forEach(id => nextSelected.delete(id));
      
      // Also uncheck all ancestors in the select set
      const ancestors = findAncestors(permissionTree, node.id);
      if (ancestors) {
        ancestors.forEach(id => nextSelected.delete(id));
      }
    } else {
      // Check this node and all descendants
      descendants.forEach(id => nextSelected.add(id));

      // Check parent nodes if all their children are now checked
      const ancestors = findAncestors(permissionTree, node.id);
      if (ancestors) {
        // Traverse backwards from immediate parent to root
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const parentId = ancestors[i];
          const parentNode = findNodeById(permissionTree, parentId);
          if (parentNode && parentNode.children) {
            // Check if all children of this parent will be checked
            const allChildrenChecked = parentNode.children.every(child => {
              if (child.id === node.id) return true; // It's being checked now
              if (descendants.includes(child.id)) return true; // Descendant of target
              
              // Verify if the child is already checked in the next selected set
              const tempSet = new Set(nextSelected);
              descendants.forEach(id => tempSet.add(id));
              
              // Helper to check in tempSet
              const checkTemp = (n: TreeNode): boolean => {
                if (tempSet.has(n.id)) return true;
                if (n.children && n.children.length > 0) {
                  return n.children.every(childNode => checkTemp(childNode));
                }
                return false;
              };
              return checkTemp(child);
            });

            if (allChildrenChecked) {
              nextSelected.add(parentId);
            }
          }
        }
      }
    }

    setSelectedKeys(nextSelected);
    onChange(Array.from(nextSelected));
  };

  const findNodeById = (nodes: TreeNode[], id: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 1:
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: '800',
            padding: '2px 8px',
            borderRadius: '100px',
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
            color: '#8b5cf6',
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}>
            NIVEL 1: PORTAL
          </span>
        );
      case 2:
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: '800',
            padding: '2px 8px',
            borderRadius: '100px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            NIVEL 2: MÓDULO
          </span>
        );
      case 3:
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: '800',
            padding: '2px 8px',
            borderRadius: '100px',
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            color: '#3b82f6',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            NIVEL 3: SUBMÓDULO
          </span>
        );
      case 4:
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: '800',
            padding: '2px 8px',
            borderRadius: '100px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.2)'
          }}>
            NIVEL 4: FILTRO DATO
          </span>
        );
      default:
        return null;
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedKeys.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const checkedStatus = isChecked(node);
    const indeterminateStatus = isIndeterminate(node);

    return (
      <div key={node.id} style={{ marginLeft: `${depth * 1.5}rem`, marginBottom: '0.4rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '8px',
          backgroundColor: checkedStatus ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
          border: checkedStatus ? '1px solid rgba(16, 185, 129, 0.08)' : '1px solid transparent',
          transition: 'all 0.2s ease',
        }}>
          {/* Collapse/Expand Toggle */}
          <div 
            onClick={() => hasChildren && toggleExpand(node.id)}
            style={{ 
              cursor: hasChildren ? 'pointer' : 'default', 
              width: '20px', 
              height: '20px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#64748b'
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            ) : (
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#cbd5e1' }} />
            )}
          </div>

          {/* Custom Checkbox */}
          <div 
            onClick={() => !isAllAccess && handleCheckboxClick(node)}
            style={{ 
              cursor: isAllAccess ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              color: checkedStatus ? '#10b981' : indeterminateStatus ? '#f59e0b' : '#94a3b8',
              opacity: isAllAccess ? 0.6 : 1
            }}
          >
            {checkedStatus ? (
              <CheckSquare size={19} />
            ) : indeterminateStatus ? (
              <MinusSquare size={19} />
            ) : (
              <Square size={19} />
            )}
          </div>

          {/* Node label and badge */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ 
              fontWeight: node.level === 1 ? '700' : node.level === 2 ? '600' : '500', 
              fontSize: node.level === 1 ? '0.95rem' : '0.875rem',
              color: checkedStatus ? '#0f172a' : '#334155'
            }}>
              {node.label}
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
              ({node.id})
            </span>
            {getLevelBadge(node.level)}
          </div>
        </div>

        {/* Children Render */}
        {hasChildren && isExpanded && (
          <div style={{
            marginTop: '0.2rem',
            borderLeft: '1px dashed #e2e8f0',
            marginLeft: '9px',
            paddingLeft: '10px'
          }}>
            {node.children!.map(child => renderNode(child, 0))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 👑 Super Admin / All Access Toggle Card */}
      <div style={{
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: isAllAccess ? 'rgba(139, 92, 246, 0.08)' : 'white',
        border: `1.5px solid ${isAllAccess ? '#8b5cf6' : '#e2e8f0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        boxShadow: isAllAccess ? '0 4px 12px rgba(139, 92, 246, 0.08)' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }} role="img" aria-label="crown">👑</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', color: isAllAccess ? '#6d28d9' : '#1e293b' }}>
              Super Administrador (All Access)
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>
              Otorga acceso total e irrestricto a todos los módulos y portales del sistema.
            </div>
          </div>
        </div>

        {/* Toggle Switch */}
        <label style={{
          position: 'relative',
          display: 'inline-block',
          width: '46px',
          height: '24px',
          cursor: 'pointer'
        }}>
          <input 
            type="checkbox"
            checked={isAllAccess}
            onChange={handleToggleAllAccess}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: isAllAccess ? '#8b5cf6' : '#cbd5e1',
            borderRadius: '24px',
            transition: '0.3s'
          }}>
            <span style={{
              position: 'absolute',
              content: '""',
              height: '18px',
              width: '18px',
              left: isAllAccess ? '24px' : '4px',
              bottom: '3px',
              backgroundColor: 'white',
              borderRadius: '50%',
              transition: '0.3s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </span>
        </label>
      </div>

      {/* The tree container */}
      <div style={{
        maxHeight: '380px',
        overflowY: 'auto',
        padding: '8px',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        backgroundColor: isAllAccess ? '#f1f5f9' : '#f8fafc',
        opacity: isAllAccess ? 0.85 : 1,
        transition: 'all 0.2s ease'
      }}>
        {permissionTree.map(node => renderNode(node, 0))}
      </div>
      
      {/* Warning banner */}
      {isAllAccess && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#b91c1c',
          fontSize: '0.8rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <ShieldAlert size={16} />
          <span>Atención: El usuario posee la llave comodín global (*) y tiene acceso irrestricto a todo el sistema.</span>
        </div>
      )}
    </div>
  );
}
