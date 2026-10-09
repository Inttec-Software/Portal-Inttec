import { logger } from './logger';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Platform, Alert } from 'react-native';
import { Gasto, GastoHelper, Asistencia, Usuario, CompanyService, supabase, inttecClient, daravisaClient } from '../services/supabase';
import { Cotizacion } from '@/types/ventas';
import { getWeekRange, processAsistenciasSemana, formatMinutesToHours, formatHoraDisplay } from './asistenciaUtils';

// Logos se cargan de forma LAZY solo cuando se genera un PDF
// Esto evita ~959 KB en el bundle principal de la app
const getCompanyBranding = async () => {
  const company = CompanyService.getActiveCompany();
  if (company === 'daravisa') {
    const { LOGO_DARAVISA_BASE64 } = await import('./logoDaravisaBase64');
    return {
      logo: LOGO_DARAVISA_BASE64,
      name: 'DARAVISA',
      tagline: 'DARAVISA S.A. DE C.V.',
    };
  }
  const { LOGO_BASE64 } = await import('./logoBase64');
  return {
    logo: LOGO_BASE64,
    name: 'INTTEC',
    tagline: 'INTEGRACION DE TECNOLOGIAS',
  };
};

export interface ReportProducto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  categoria_id: string;
  stock_actual: number;
  precio_unitario?: number;
  activo: boolean;
}

export interface ReportCategoria {
  id: string;
  nombre: string;
}

/**
 * Escapes values for CSV export and protects against Excel formula injection (#¿NOMBRE? or #NAME? errors)
 * when text starts with '=', '+', '-', or '@'.
 */
const escapeCSVCell = (text?: string | number | null): string => {
  if (text === null || text === undefined || text === '') return '""';
  let str = String(text).replace(/"/g, '""');
  if (/^[\=\+\-\@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str}"`;
};


/**
 * Detecta si un gasto tiene alguna alerta de política (como alcohol, tabaco o montos sospechosos)
 */
const hasPolicyAlert = (g: Gasto): { alert: boolean; reason: string } => {
  const just = g.justificacion || '';
  
  // 1. Detectar si el formulario guardó una alerta estructurada de la IA
  const match = just.match(/^\[ALERTA IA:\s*([\s\S]*?)\]/);
  if (match) {
    return { alert: true, reason: match[1].trim() };
  }
  
  // 2. Búsqueda complementaria de palabras clave en la justificación, categoría, subcategoría o proveedor
  const textToSearch = `${just} ${GastoHelper.getCategoria(g)} ${GastoHelper.getSubcategoria(g)} ${GastoHelper.getProveedor(g)}`.toLowerCase();
  
  if (textToSearch.includes('alcohol') || textToSearch.includes('cerveza') || textToSearch.includes('vino') || textToSearch.includes('licor') || textToSearch.includes('bebida alcohólica')) {
    return { alert: true, reason: 'Posible compra de alcohol' };
  }
  if (textToSearch.includes('cigarro') || textToSearch.includes('cigarrillo') || textToSearch.includes('tabaco') || textToSearch.includes('cajetilla')) {
    return { alert: true, reason: 'Posible compra de tabaco' };
  }
  if (textToSearch.includes('excesivo') || textToSearch.includes('exceso') || textToSearch.includes('inflado')) {
    return { alert: true, reason: 'Monto sospechoso o propina excesiva' };
  }
  
  return { alert: false, reason: '' };
};

export const ReportGenerator = {
  /**
   * Genera un reporte PDF completo de movimientos de inventario (Entradas, Salidas, Retiros, Compras)
   */
  async exportMovimientosToPDF(movimientos: any[], title: string = 'Reporte de Movimientos de Inventario', periodo?: string): Promise<void> {
    if (movimientos.length === 0) {
      throw new Error('No hay movimientos para exportar.');
    }
    const branding = await getCompanyBranding();

    const totalMovs = movimientos.length;
    let totalEntradas = 0;
    let totalSalidas = 0;
    movimientos.forEach(m => {
      const q = Number(m.cantidad || 0);
      if (m.tipo === 'ENTRADA') totalEntradas += q;
      else totalSalidas += q;
    });

    let tableRows = '';
    movimientos.forEach((m, idx) => {
      const fecha = m.fecha ? new Date(m.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const isEntrada = m.tipo === 'ENTRADA';
      const typeBadgeColor = isEntrada ? '#10B981' : '#EF4444';
      const isGasto = m.tipo === 'GASTO' || m.subtipo === 'GASTO' || m.subtipo === 'CONSUMO';
      const isSalida = m.tipo === 'SALIDA' || m.subtipo === 'SALIDA' || m.subtipo === 'RETIRO';
      const subtipoLabel = isGasto ? 'Gasto' : (isSalida ? 'SALIDA' : (m.subtipo || m.tipo));
      const subtipoColor = isGasto ? '#8B5CF6' : (isSalida ? '#EF4444' : (m.subtipo === 'DEVOLUCIÓN' ? '#2563EB' : '#6b7280'));

      const prodName = m.producto_nombre || 'Producto';
      const prodSku = m.producto_sku || '-';
      const cantFormatted = `${isEntrada ? '+' : '-'}${m.cantidad} ${m.producto_unidad || 'pza'}`;
      const responsable = m.usuario_nombre || m.empleado_nombre || 'Almacén';
      const folioDetalle = m.detalle_motivo || m.folio_factura || '-';
      const clientInfo = m.cliente_nombre ? `${m.cliente_nombre}${m.tipo_gasto ? ` [${m.tipo_gasto}]` : ''}` : '';

      tableRows += `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="font-size: 10px; color: #4b5563; white-space: nowrap;">${fecha}</td>
          <td>
            ${isGasto ? `
              <span style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 4px; color: #ffffff; background-color: #8B5CF6;">
                GASTO
              </span>
            ` : isSalida ? `
              <span style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 4px; color: #ffffff; background-color: #EF4444;">
                SALIDA
              </span>
            ` : `
              <span style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 4px; color: #ffffff; background-color: ${typeBadgeColor};">
                ${m.tipo}
              </span>
              ${subtipoLabel !== m.tipo ? `<br/><span style="display: inline-block; margin-top: 2px; padding: 1px 4px; font-size: 8px; color: ${subtipoColor}; font-weight: 700; border: 1px solid ${subtipoColor}40; border-radius: 3px; background: ${subtipoColor}15;">${subtipoLabel}</span>` : ''}
            `}
          </td>
          <td>
            <strong style="font-size: 11px; color: #111827;">${prodName}</strong><br/>
            <small style="font-size: 9px; color: #6b7280;">SKU: ${prodSku}</small>
          </td>
          <td style="text-align: right; font-weight: bold; font-size: 11px; color: ${typeBadgeColor}; white-space: nowrap;">
            ${cantFormatted}
          </td>
          <td style="font-size: 10px; color: #374151;">${responsable}</td>
          <td style="font-size: 9px; color: #4b5563;">
            ${folioDetalle}
            ${clientInfo ? `<br/><span style="color: #2563EB; font-weight: 600;">${clientInfo}</span>` : ''}
          </td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 20px; color: #1f2937; font-size: 11px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #E11D48; padding-bottom: 12px; margin-bottom: 16px; }
          .logo { max-height: 48px; }
          .title { font-size: 18px; font-weight: bold; color: #111827; margin: 0; }
          .subtitle { font-size: 11px; color: #6b7280; margin-top: 4px; }
          .summary-cards { display: flex; gap: 12px; margin-bottom: 16px; }
          .card { flex: 1; padding: 10px; background: #f3f4f6; border-radius: 6px; border: 1px solid #e5e7eb; }
          .card-title { font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold; }
          .card-val { font-size: 16px; font-weight: bold; color: #111827; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background-color: #1f2937; color: #ffffff; text-align: left; padding: 8px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 6px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
          .footer { margin-top: 24px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${title}</h1>
            ${periodo ? `<div style="font-size: 12px; font-weight: bold; color: #0284c7; margin-top: 2px;">Período: ${periodo}</div>` : ''}
            <div class="subtitle">Generado el: ${new Date().toLocaleString('es-MX')} • Empresa: ${branding.name}</div>
          </div>
          ${branding.logo ? `<img class="logo" src="${branding.logo}" />` : `<h2 style="color: #E11D48; margin: 0;">${branding.name}</h2>`}
        </div>

        <div class="summary-cards">
          <div class="card">
            <div class="card-title">Total Registros</div>
            <div class="card-val">${totalMovs}</div>
          </div>
          <div class="card" style="border-left: 4px solid #10B981;">
            <div class="card-title" style="color: #059669;">Total Entradas</div>
            <div class="card-val" style="color: #059669;">+${totalEntradas} un.</div>
          </div>
          <div class="card" style="border-left: 4px solid #EF4444;">
            <div class="card-title" style="color: #DC2626;">Total Salidas / Retiros</div>
            <div class="card-val" style="color: #DC2626;">-${totalSalidas} un.</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th width="12%">Fecha</th>
              <th width="10%">Tipo</th>
              <th width="32%">Producto</th>
              <th width="12%" style="text-align: right;">Cantidad</th>
              <th width="16%">Responsable</th>
              <th width="18%">Concepto / Detalle</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento oficial generado desde Portal ${branding.name} • Control y Auditoría de Almacén
        </div>
      </body>
      </html>
    `;

    await ReportGenerator._printOrDownload(htmlContent, `reporte_movimientos_${Date.now()}.pdf`);
  },

  /**
   * Genera el vale individual de un movimiento o retiro de material en PDF
   */
  async exportSingleMovimientoValePDF(mov: any): Promise<void> {
    const branding = await getCompanyBranding();
    const fecha = mov.fecha ? new Date(mov.fecha).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : new Date().toLocaleDateString('es-MX');
    const isEntrada = mov.tipo === 'ENTRADA';
    const isGasto = mov.tipo === 'GASTO' || mov.subtipo === 'GASTO' || mov.subtipo === 'CONSUMO';
    const tipoColor = isEntrada ? '#10B981' : isGasto ? '#8B5CF6' : '#0d1b2a';
    const tipoTitle = isEntrada ? 'VALE DE ENTRADA / INGRESO DE MATERIAL' : isGasto ? 'VALE DE GASTO DE MATERIAL' : 'VALE DE SALIDA Y CARTA RESPONSIVA DE MATERIAL';

    const items = Array.isArray(mov.materiales) && mov.materiales.length > 0 
      ? mov.materiales 
      : [{
          sku: mov.producto_sku || '-',
          nombre: mov.producto_nombre || 'Producto',
          cantidad: mov.cantidad || 0,
          unidad: mov.producto_unidad || 'pza'
        }];

    let itemsRows = '';
    items.forEach((item: any, idx: number) => {
      itemsRows += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><code>${item.sku || '-'}</code></td>
          <td><strong>${item.nombre}</strong></td>
          <td style="text-align: right; font-weight: bold; font-size: 13px; color: ${tipoColor};">${item.cantidad} ${item.unidad || 'pza'}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 30px; color: #1f2937; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${tipoColor}; padding-bottom: 15px; }
          .logo { max-height: 50px; }
          .title { font-size: 18px; font-weight: bold; color: ${tipoColor}; margin: 0; }
          .folio { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-top: 20px; display: flex; flex-wrap: wrap; gap: 15px; }
          .info-col { flex: 1; min-width: 200px; }
          .info-label { font-size: 10px; font-weight: bold; color: #6b7280; text-transform: uppercase; }
          .info-val { font-size: 13px; font-weight: bold; color: #111827; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 25px; }
          th { background-color: #1f2937; color: #fff; padding: 10px; font-size: 11px; text-transform: uppercase; }
          td { padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
          .signatures { display: flex; justify-content: center; margin-top: 35px; }
          .sig-box { width: 55%; max-width: 320px; text-align: center; font-size: 11px; }
          .sig-image-container { height: 60px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 2px; }
          .sig-line { border-top: 1.5px solid #111827; width: 100%; margin: 0 0 6px 0; }
          .no-print { margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px; }
          .btn-download {
            background-color: #2563eb;
            color: #ffffff;
            border: none;
            padding: 10px 18px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: background-color 0.2s;
          }
          .btn-download:hover { background-color: #1d4ed8; }
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button class="btn-download" onclick="window.print()">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
            Descargar / Imprimir PDF
          </button>
        </div>

        <div class="header">
          <div>
            <h1 class="title">${tipoTitle}</h1>
            <div class="folio">Folio / Identificador: <strong>${mov.id ? mov.id.substring(0, 13) : 'VALE-INTTEC'}</strong></div>
          </div>
          ${branding.logo ? `<img class="logo" src="${branding.logo}" />` : `<h2 style="color: ${tipoColor}; margin: 0;">${branding.name}</h2>`}
        </div>

        <div class="info-box">
          <div class="info-col">
            <div class="info-label">Fecha y Hora</div>
            <div class="info-val">${fecha}</div>
          </div>
          <div class="info-col">
            <div class="info-label">Responsable / Empleado</div>
            <div class="info-val">${mov.usuario_nombre || mov.empleado_nombre || 'Personal Autorizado'}</div>
          </div>
          ${mov.cliente_nombre ? `
          <div class="info-col">
            <div class="info-label">Cliente / Destino</div>
            <div class="info-val">${mov.cliente_nombre} ${mov.sucursal_nombre ? `(${mov.sucursal_nombre})` : ''}</div>
          </div>
          ` : ''}
          ${mov.tipo_gasto ? `
          <div class="info-col">
            <div class="info-label">Tipo de Gasto / Proyecto</div>
            <div class="info-val">${mov.tipo_gasto}</div>
          </div>
          ` : ''}
          <div class="info-col" style="width: 100%;">
            <div class="info-label">Concepto / Motivo</div>
            <div class="info-val">${mov.detalle_motivo || mov.motivo || mov.folio_factura || 'Movimiento de material en almacén'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th width="8%">#</th>
              <th width="22%">SKU</th>
              <th width="50%">Descripción del Material</th>
              <th width="20%" style="text-align: right;">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        ${!isEntrada ? `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-top: 25px; font-size: 10px; color: #334155; line-height: 1.4;">
          <strong style="color: #0f172a; text-transform: uppercase; font-size: 10px; display: block; margin-bottom: 4px;">
            Compromiso de Resguardo y Carta Responsiva de Material
          </strong>
          Por medio de la presente, el trabajador manifiesta recibir en óptimas condiciones y a entera satisfacción los materiales y equipos especificados, comprometiéndose a destinarlos única y exclusivamente a las actividades laborales asignadas por <strong>${branding.name}</strong>, asumiendo la custodia, conservación y responsabilidad de devolución de sobrantes o herramientas al término de los trabajos.
        </div>
        ` : ''}

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-image-container">
              ${mov.firma_base64 || mov.firma_url || mov.firma ? `
                <img src="${mov.firma_base64 || mov.firma_url || mov.firma}" style="max-height: 58px; max-width: 200px; object-fit: contain;" />
              ` : '<div style="height: 45px;"></div>'}
            </div>
            <div class="sig-line"></div>
            <strong>${!isEntrada ? 'TRABAJADOR / RESPONSABLE RECEPTOR' : 'RECIBIÓ / CONFORME'}</strong><br/>
            <span>${mov.usuario_nombre || mov.empleado_nombre || 'Empleado Receptor'}</span>
            ${mov.firmado_en || mov.firma_base64 ? `
              <div style="font-size: 9px; color: #64748b; margin-top: 4px;">
                Firmado digitalmente: ${mov.firmado_en ? new Date(mov.firmado_en).toLocaleString('es-MX') : fecha}
              </div>
            ` : ''}
          </div>
        </div>
      </body>
      </html>
    `;

    await ReportGenerator._printOrDownload(htmlContent, `vale_movimiento_${mov.id || Date.now()}.pdf`);
  },

  /**
   * Helper unificado para imprimir en Web o compartir en Móvil
   */
  
  async _exportArrayToXLSX(sheetName: string, headers: string[], rows: any[][], filename: string): Promise<void> {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    if (Platform.OS === 'web') {
      XLSX.writeFile(wb, filename);
    } else {
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${cacheDirectory}${filename}`;
      await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: `Exportar ${sheetName}` });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    }
  },

  async _printOrDownload(htmlContent: string, defaultFilename: string): Promise<void> {
    if (Platform.OS === 'web') {
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.title = defaultFilename.replace('.pdf', '');
        newWindow.document.close();
        setTimeout(() => {
          try {
            newWindow.focus();
            newWindow.print();
          } catch (e) {
            console.error('Error al imprimir documento:', e);
          }
        }, 500);
      }
    } else {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: defaultFilename });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    }
  },

  /**
   * Genera un reporte PDF de los gastos y lo comparte mediante la hoja nativa
   */
  async exportToPDF(gastos: Gasto[], title: string = 'Reporte de Control de Gastos', periodo?: string): Promise<void> {
    if (gastos.length === 0) {
      throw new Error('No hay gastos para exportar.');
    }
    const branding = await getCompanyBranding();

    const totalMonto = gastos.reduce((sum, g) => sum + Number(g.monto), 0);
    const approvedCount = gastos.filter((g) => g.status === 'APPROVED').length;
    const pendingCount = gastos.filter((g) => g.status === 'PENDING').length;

    // Generar tabla HTML
    let tableRows = '';
    gastos.forEach((g) => {
      const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
      const montoFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(g.monto));

      let badgeColor = '#FFC107'; // PENDING -> Yellow
      if (g.status === 'APPROVED') badgeColor = '#4CAF50';
      if (g.status === 'REJECTED') badgeColor = '#F44336';
      if (g.status === 'ACTION_REQUIRED') badgeColor = '#2196F3';

      const provName = GastoHelper.getProveedor(g) || 'N/A';
      const catName = GastoHelper.getCategoria(g) || 'N/A';
      const subName = GastoHelper.getSubcategoria(g) || '';
      const sucName = GastoHelper.getSucursal(g) || 'Sin Sucursal';

      const commentText = g.justificacion ? g.justificacion.replace(/\[[\s\S]*?\]/g, '').trim() : '';
      
      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>${g.empleado_nombre || 'Desconocido'}</td>
          <td>${provName} <br/><small style="color: #666;">${sucName}</small></td>
          <td>
            ${catName}${subName ? ` - ${subName}` : ''}
          </td>
          <td style="font-size: 9px; max-width: 120px; overflow: hidden; text-overflow: ellipsis;" title="${commentText}">${commentText || 'N/A'}</td>
          <td>${g.metodo_pago}${g.tipo_tarjeta ? ` (${g.tipo_tarjeta})` : ''}</td>
          <td><span class="status-badge" style="background-color: ${badgeColor};">${g.status}</span></td>
          <td style="text-align: right; font-weight: bold;">${montoFormatted}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 15mm;
            }
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #0d1b2a;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .logo-container {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo-text {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          }
          .logo-brand {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-weight: 900;
            font-style: italic;
            font-size: 38px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 300px;
            height: 100px;
            object-fit: contain;
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .status-badge {
            color: white;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              ${periodo ? `<p style="margin: 4px 0 0 0; font-size: 13px; font-weight: bold; color: #0284c7;">Período: ${periodo}</p>` : ''}
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 25%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Gastos</div>
                <div class="value">${gastos.length}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Aprobados</div>
                <div class="value" style="color: #4CAF50;">${approvedCount}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Pendientes</div>
                <div class="value" style="color: #FFC107;">${pendingCount}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Monto Total</div>
                <div class="value" style="color: #1b4965;">${new Intl.NumberFormat('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                }).format(totalMonto)}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 10%">Fecha</th>
              <th style="width: 15%">Empleado</th>
              <th style="width: 15%">Proveedor / Sucursal</th>
              <th style="width: 15%">Categoría</th>
              <th style="width: 15%">Comentarios</th>
              <th style="width: 12%">Pago</th>
              <th style="width: 8%">Estado</th>
              <th style="width: 10%; text-align: right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Gastos - Sistema Automatizado
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      // Generar archivo PDF temporal y obtener su base64 para evitar bloqueos del sistema de archivos en Android
      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      
      // Para evitar el error "Not allowed to read file under given URL" y "isn't readable" en Android,
      // guardamos el PDF a partir de su contenido Base64 directamente en cacheDirectory.
      const pdfFileName = `reporte_gastos_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      // Compartir nativamente
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating PDF report:', error);
      throw new Error(error.message || 'Error al generar el reporte PDF.');
    }
  },

  /**
   * Genera un reporte PDF del consumo de gasolina y lo comparte
   */
  async exportGasolinaToPDF(
    registros: any[],
    title: string = 'Reporte de Consumo de Gasolina',
    periodo?: string
  ): Promise<void> {
    if (registros.length === 0) {
      throw new Error('No hay registros de gasolina para exportar.');
    }

    const branding = await getCompanyBranding();

    const totalLitros = registros.reduce((sum, r) => sum + Number(r.litros || 0), 0);
    const totalCosto = registros.reduce((sum, r) => sum + Number(r.costo_total || 0), 0);
    const formatMXN = (n: number) =>
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

    let tableRows = '';
    registros.forEach((r) => {
      const dateParts = (r.fecha || '').split('-');
      const fecha = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : r.fecha;
      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>${r.empleado_nombre || 'N/A'}</td>
          <td>${r.vehiculo_marca || ''} ${r.vehiculo_modelo || ''}<br/><small style="color:#888">${r.vehiculo_placas || ''}</small></td>
          <td style="text-align:center">${Number(r.litros || 0).toFixed(2)} L</td>
          <td style="text-align:center">${Number(r.kilometraje_actual || 0).toLocaleString('es-MX')} km</td>
          <td style="text-align:right; font-weight:bold; color:#059669">${formatMXN(Number(r.costo_total || 0))}</td>
          <td>${r.observaciones || 'â€”'}</td>
        </tr>`;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; background: #fff; padding: 24px; }
          .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 20px; }
          .logo-img {
            width: 300px;
            height: 100px;
            object-fit: contain;
          }
          .logo-brand { font-size: 38px; font-weight: 900; color: #0ea5e9; letter-spacing: 2px; }
          .logo-tagline { font-size: 10px; color: #64748b; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
          h1 { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; margin-bottom: 20px; }
          .summary { display: flex; gap: 12px; margin-bottom: 20px; }
          .stat { flex: 1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; text-align: center; }
          .stat-value { font-size: 20px; font-weight: 900; color: #0369a1; }
          .stat-label { font-size: 10px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead tr { background: #0ea5e9; color: white; }
          th { padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          tr:nth-child(even) td { background: #f8fafc; }
          tr:hover td { background: #e0f2fe; }
          .footer { margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo-img" src="${branding.logo}" />
          <div style="margin-left:auto; text-align:right">
            <h1>${title}</h1>
            ${periodo ? `<div style="font-size: 12px; font-weight: bold; color: #0284c7; margin-top: 2px;">Período: ${periodo}</div>` : ''}
            <div class="subtitle">Generado: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>

        <div class="summary">
          <div class="stat">
            <div class="stat-value">${registros.length}</div>
            <div class="stat-label">Cargas Registradas</div>
          </div>
          <div class="stat">
            <div class="stat-value">${totalLitros.toFixed(1)} L</div>
            <div class="stat-label">Total Litros</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatMXN(totalCosto)}</div>
            <div class="stat-label">Costo Total</div>
          </div>
          <div class="stat">
            <div class="stat-value">${totalLitros > 0 ? formatMXN(totalCosto / totalLitros) : '$0.00'}</div>
            <div class="stat-label">Precio Prom. / Litro</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Conductor</th>
              <th>Vehículo</th>
              <th>Litros</th>
              <th>Odómetro</th>
              <th style="text-align:right">Costo</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Reporte de Consumo de Combustible â€” ${branding.tagline} â€” Sistema Automatizado
        </div>
      </body>
      </html>`;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_gasolina_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      await writeAsStringAsync(safeUri, base64 || '', { encoding: EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating gasolina PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte PDF de gasolina.');
    }
  },


  async exportAsistenciasToPDF(
    asistencias: Asistencia[],
    personal: Usuario[],
    title: string = 'Reporte de Asistencia',
    periodo?: string
  ): Promise<void> {
    if (asistencias.length === 0) {
      throw new Error('No hay registros de asistencia para exportar.');
    }
    const branding = await getCompanyBranding();

    const empleadosMap = new Map((personal || []).map((p) => [p.id, p.nombre]));

    let tableRows = '';
    asistencias.forEach((a: any) => {
      const empleadoNombre =
        empleadosMap.get(a.empleado_id) ||
        empleadosMap.get(a.usuario_id) ||
        (a.empleados ? `${a.empleados.nombre || ''} ${a.empleados.apellidos || ''}`.trim() : null) ||
        (a.empleado ? `${a.empleado.nombre || ''} ${a.empleado.apellidos || ''}`.trim() : null) ||
        a.empleado_nombre ||
        a.usuario_nombre ||
        'Desconocido';
      const fecha = a.fecha || '';
      const horaEntrada = a.hora_entrada || '--:--';
      const dirEntrada = a.direccion_entrada || 'N/A';
      const horaSalida = a.hora_salida || '--:--';
      const dirSalida = a.direccion_salida || 'N/A';

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>${empleadoNombre}</td>
          <td style="color: #4CAF50; font-weight: bold;">${horaEntrada}</td>
          <td style="font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${dirEntrada}">${dirEntrada}</td>
          <td style="color: #F44336; font-weight: bold;">${horaSalida}</td>
          <td style="font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${dirSalida}">${dirSalida}</td>
        </tr>
      `;
    });

    const totalEntradas = asistencias.filter((a) => a.hora_entrada).length;
    const totalSalidas = asistencias.filter((a) => a.hora_salida).length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 15mm;
            }
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 8px 6px;
            font-weight: 600;
          }
          td {
            padding: 8px 6px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 38px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 300px;
            height: 100px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              ${periodo ? `<p style="margin: 4px 0 0 0; font-size: 13px; font-weight: bold; color: #0284c7;">Período: ${periodo}</p>` : ''}
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 33%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Registros</div>
                <div class="value">${asistencias.length}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Entradas Checadas</div>
                <div class="value" style="color: #4CAF50;">${totalEntradas}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Salidas Checadas</div>
                <div class="value" style="color: #F44336;">${totalSalidas}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">Fecha</th>
              <th style="width: 18%">Empleado</th>
              <th style="width: 10%">Entrada</th>
              <th style="width: 30%">Ubicación Entrada</th>
              <th style="width: 10%">Salida</th>
              <th style="width: 30%">Ubicación Salida</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Asistencias - Sistema Automatizado
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_asistencia_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Asistencia PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating attendance PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de asistencia.');
    }
  },

  /**
   * Helper unificado para imprimir en Web o guardar y compartir en Móvil
   */
  async _printOrShareHtml(htmlContent: string, fileName: string, dialogTitle: string): Promise<void> {
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      }
      return;
    }

    const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
    const safeUri = `${cacheDirectory}${fileName}`;
    await writeAsStringAsync(safeUri, base64 || '', {
      encoding: EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(safeUri, {
        mimeType: 'application/pdf',
        dialogTitle: dialogTitle || 'Exportar PDF',
        UTI: 'com.adobe.pdf',
      });
    } else {
      throw new Error('La función de compartir no está disponible.');
    }
  },

  /**
   * Genera el Reporte General de Asistencia Semanal en PDF (Todos los empleados)
   * Incluye total de horas de la semana por empleado y subíndice detallado de cada turno por día
   */
  async exportReporteAsistenciaSemanalGeneralPDF(
    asistencias: Asistencia[],
    personal: Usuario[],
    weekMondayInput?: Date | string
  ): Promise<void> {
    const range = getWeekRange(weekMondayInput);
    const branding = await getCompanyBranding();

    const asistenciasPorEmpleado = new Map<string, Asistencia[]>();
    for (const a of asistencias) {
      const empId = a.empleado_id;
      if (!empId) continue;
      const list = asistenciasPorEmpleado.get(empId) || [];
      list.push(a);
      asistenciasPorEmpleado.set(empId, list);
    }

    const personalTarget = (personal || []).filter(
      p => p.rol === 'EMPLEADO' || p.rol === 'ADMIN' || asistenciasPorEmpleado.has(p.id)
    );

    let totalMinutosEmpresa = 0;
    let totalMinutosRegularesEmpresa = 0;
    let totalMinutosExtrasEmpresa = 0;
    let totalTurnosEmpresa = 0;
    let empleadosConRegistro = 0;

    let empleadosHtml = '';

    for (const emp of personalTarget) {
      const asistenciasEmp = asistenciasPorEmpleado.get(emp.id) || [];
      const semanaData = processAsistenciasSemana(asistenciasEmp, range.mondayDate);

      if (semanaData.turnosTotales > 0) {
        empleadosConRegistro++;
        totalMinutosEmpresa += semanaData.totalMinutosSemana;
        totalMinutosRegularesEmpresa += semanaData.totalMinutosRegulares;
        totalMinutosExtrasEmpresa += semanaData.totalMinutosExtra;
        totalTurnosEmpresa += semanaData.turnosTotales;
      }

      let diasHtml = '';
      const diasConTurnos = semanaData.dias.filter(d => d.turnos.length > 0);

      if (diasConTurnos.length === 0) {
        diasHtml = `
          <tr>
            <td colspan="5" style="text-align: center; color: #888; font-style: italic; padding: 10px;">
              Sin registros de asistencia en esta semana
            </td>
          </tr>
        `;
      } else {
        for (const dia of diasConTurnos) {
          for (const turno of dia.turnos) {
            diasHtml += `
              <tr>
                <td style="font-weight: 600; color: #0d1b2a;">
                  ${dia.dayName} ${dia.shortDate}
                </td>
                <td style="text-align: center;">
                  <span style="background-color: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">
                    Turno #${turno.index}
                  </span>
                </td>
                <td>
                  <span style="color: #16a34a; font-weight: bold;">📥 ${turno.hora_entrada}</span>
                  ${turno.direccion_entrada ? `<div style="font-size: 8px; color: #666; margin-top: 2px;">📍 ${turno.direccion_entrada}</div>` : ''}
                </td>
                <td>
                  <span style="color: ${turno.hora_salida ? '#0284c7' : '#d97706'}; font-weight: bold;">
                    ${turno.hora_salida ? `📤 ${turno.hora_salida}` : '⏳ Pendiente'}
                  </span>
                  ${turno.direccion_salida ? `<div style="font-size: 8px; color: #666; margin-top: 2px;">📍 ${turno.direccion_salida}</div>` : ''}
                </td>
                <td style="text-align: right; font-weight: bold;">
                  <span style="color: ${turno.enCurso ? '#d97706' : '#16a34a'};">${turno.duracionStr}</span>
                  ${turno.minutosExtra > 0 ? `<div style="font-size: 8.5px; color: #ea580c; font-weight: bold; margin-top: 2px;">+${turno.horasExtraStr} extra</div>` : ''}
                </td>
              </tr>
            `;
          }
        }
      }

      empleadosHtml += `
        <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
          <div style="background-color: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 13px; font-weight: bold; color: #0f172a;">👤 ${emp.nombre}</span>
              <span style="margin-left: 8px; font-size: 10px; background-color: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px;">${emp.rol || 'EMPLEADO'}</span>
              ${emp.sucursal ? `<span style="margin-left: 6px; font-size: 10px; color: #64748b;">(${emp.sucursal})</span>` : ''}
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="font-size: 10px; color: #64748b;">Días: <b>${semanaData.diasLaborados}/7</b></span>
              <span style="background-color: #dcfce7; color: #15803d; padding: 3px 7px; border-radius: 6px; font-weight: bold; font-size: 11px;">
                Regulares: ${semanaData.totalHorasRegularesStr}
              </span>
              ${semanaData.totalMinutosExtra > 0 ? `
                <span style="background-color: #ffedd5; color: #c2410c; padding: 3px 7px; border-radius: 6px; font-weight: bold; font-size: 11px;">
                  🔥 Extras: +${semanaData.totalHorasExtraStr}
                </span>
              ` : ''}
              <span style="background-color: #f1f5f9; color: #0f172a; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 12px;">
                Total: ${semanaData.totalHorasSemanaStr}
              </span>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #475569; text-transform: uppercase; font-size: 9px;">
                <th style="padding: 6px 10px; text-align: left; width: 18%;">Día / Fecha</th>
                <th style="padding: 6px 8px; text-align: center; width: 12%;">Subíndice</th>
                <th style="padding: 6px 10px; text-align: left; width: 32%;">Entrada</th>
                <th style="padding: 6px 10px; text-align: left; width: 32%;">Salida</th>
                <th style="padding: 6px 10px; text-align: right; width: 16%;">Duración</th>
              </tr>
            </thead>
            <tbody>
              ${diasHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte General de Asistencia Semanal</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter;
            margin: 12mm;
          }
          .title {
            color: #0d1b2a;
            font-size: 20px;
            font-weight: bold;
            margin: 0;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            gap: 10px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 15px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 3px;
          }
          .summary-card .label {
            font-size: 9px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: bold;
          }
          table td {
            padding: 6px 10px;
            border-bottom: 1px solid #f1f5f9;
          }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
          }
          .logo-img {
            max-height: 44px;
            max-width: 170px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #0d1b2a; padding-bottom: 10px; margin-bottom: 14px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title">Reporte General de Asistencia Semanal</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: bold; color: #0284c7;">📅 ${range.label}</p>
              <p style="margin: 2px 0 0 0; font-size: 9px; color: #64748b;">Horario laboral estándar: 08:00 AM - 06:00 PM (10h jornada)</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              ${branding.logo ? `<img src="${branding.logo}" class="logo-img" alt="${branding.name}" />` : `<span style="font-size: 20px; font-weight: 900; color: #0d1b2a;">${branding.name}</span>`}
            </td>
          </tr>
        </table>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Personal Activo</div>
            <div class="value">${empleadosConRegistro} de ${personalTarget.length}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Horas Empresa</div>
            <div class="value" style="color: #0f172a;">${formatMinutesToHours(totalMinutosEmpresa)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Horas Regulares (8-6)</div>
            <div class="value" style="color: #16a34a;">${formatMinutesToHours(totalMinutosRegularesEmpresa)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Horas Extras Totales</div>
            <div class="value" style="color: #ea580c;">${formatMinutesToHours(totalMinutosExtrasEmpresa)}</div>
          </div>
        </div>

        ${empleadosHtml}

        <div class="footer">
          Sistema Inttec & Daravisa - Reporte Oficial de Asistencias y Turnos Semanales - Documento Confidencial
        </div>
      </body>
      </html>
    `;

    await ReportGenerator._printOrShareHtml(
      htmlContent,
      `reporte_asistencia_general_${range.mondayStr}.pdf`,
      'Reporte General de Asistencia PDF'
    );
  },

  /**
   * Genera el Reporte Individual de Asistencia Semanal en PDF para un empleado
   */
  async exportReporteAsistenciaEmpleadoPDF(
    asistencias: Asistencia[],
    empleado: Usuario,
    weekMondayInput?: Date | string
  ): Promise<void> {
    const range = getWeekRange(weekMondayInput);
    const branding = await getCompanyBranding();
    const semanaData = processAsistenciasSemana(asistencias, range.mondayDate);

    let diasHtml = '';
    for (const dia of semanaData.dias) {
      if (dia.turnos.length === 0) {
        diasHtml += `
          <tr>
            <td style="font-weight: 600; color: #0d1b2a;">${dia.dayName} ${dia.shortDate}</td>
            <td colspan="4" style="text-align: center; color: #94a3b8; font-style: italic;">Sin registros</td>
          </tr>
        `;
      } else {
        dia.turnos.forEach((turno, idx) => {
          diasHtml += `
            <tr>
              <td style="font-weight: 600; color: #0d1b2a;">
                ${idx === 0 ? `${dia.dayName} ${dia.shortDate}` : `<span style="color: #94a3b8; font-size: 8px;">↳ ${dia.dayName}</span>`}
              </td>
              <td style="text-align: center;">
                <span style="background-color: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">
                  Turno #${turno.index}
                </span>
              </td>
              <td>
                <span style="color: #16a34a; font-weight: bold;">📥 ${turno.hora_entrada}</span>
                ${turno.direccion_entrada ? `<div style="font-size: 8px; color: #666; margin-top: 2px;">📍 ${turno.direccion_entrada}</div>` : ''}
              </td>
              <td>
                <span style="color: ${turno.hora_salida ? '#0284c7' : '#d97706'}; font-weight: bold;">
                  ${turno.hora_salida ? `📤 ${turno.hora_salida}` : '⏳ Pendiente'}
                </span>
                ${turno.direccion_salida ? `<div style="font-size: 8px; color: #666; margin-top: 2px;">📍 ${turno.direccion_salida}</div>` : ''}
              </td>
              <td style="text-align: right; font-weight: bold;">
                <span style="color: ${turno.enCurso ? '#d97706' : '#16a34a'};">${turno.duracionStr}</span>
                ${turno.minutosExtra > 0 ? `<div style="font-size: 8.5px; color: #ea580c; font-weight: bold; margin-top: 2px;">+${turno.horasExtraStr} extra</div>` : ''}
              </td>
            </tr>
          `;
        });
      }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte de Asistencia - ${empleado.nombre}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter;
            margin: 12mm;
          }
          .title {
            color: #0d1b2a;
            font-size: 20px;
            font-weight: bold;
            margin: 0;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            gap: 10px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 16px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 3px;
          }
          .summary-card .label {
            font-size: 9px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 8px 10px;
            font-size: 9px;
            text-transform: uppercase;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #f1f5f9;
          }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
          }
          .logo-img {
            max-height: 44px;
            max-width: 170px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #0d1b2a; padding-bottom: 10px; margin-bottom: 14px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title">Reporte Individual de Asistencia</h1>
              <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: bold; color: #0f172a;">👤 ${empleado.nombre}</p>
              <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: bold; color: #0284c7;">📅 ${range.label}</p>
              <p style="margin: 2px 0 0 0; font-size: 9px; color: #64748b;">Rol: ${empleado.rol || 'EMPLEADO'} | Sucursal: ${empleado.sucursal || 'N/A'} | Horario: 08:00 - 18:00</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              ${branding.logo ? `<img src="${branding.logo}" class="logo-img" alt="${branding.name}" />` : `<span style="font-size: 20px; font-weight: 900; color: #0d1b2a;">${branding.name}</span>`}
            </td>
          </tr>
        </table>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Horas Semana</div>
            <div class="value" style="color: #0f172a; font-size: 17px;">${semanaData.totalHorasSemanaStr}</div>
          </div>
          <div class="summary-card">
            <div class="label">Horas Regulares (8-6)</div>
            <div class="value" style="color: #16a34a; font-size: 17px;">${semanaData.totalHorasRegularesStr}</div>
          </div>
          <div class="summary-card">
            <div class="label">Horas Extras</div>
            <div class="value" style="color: #ea580c; font-size: 17px;">${semanaData.totalHorasExtraStr}</div>
          </div>
          <div class="summary-card">
            <div class="label">Días Laborados</div>
            <div class="value">${semanaData.diasLaborados} de 7</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Día / Fecha</th>
              <th style="width: 12%; text-align: center;">Subíndice</th>
              <th style="width: 32%;">Entrada</th>
              <th style="width: 32%;">Salida</th>
              <th style="width: 16%; text-align: right;">Duración</th>
            </tr>
          </thead>
          <tbody>
            ${diasHtml}
          </tbody>
        </table>

        <div class="footer">
          Sistema Inttec & Daravisa - Reporte Oficial de Asistencias - Documento Confidencial
        </div>
      </body>
      </html>
    `;

    const safeName = (empleado.nombre || 'empleado').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    await ReportGenerator._printOrShareHtml(
      htmlContent,
      `reporte_asistencia_${safeName}_${range.mondayStr}.pdf`,
      `Reporte Asistencia ${empleado.nombre}`
    );
  },
  async exportInventarioToPDF(
    productos: ReportProducto[],
    categorias: ReportCategoria[],
    title: string = 'Reporte de Inventario',
    periodo?: string
  ): Promise<void> {
    if (productos.length === 0) {
      throw new Error('No hay productos en el inventario para exportar.');
    }
    const branding = await getCompanyBranding();

    const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

    let tableRows = '';
    let totalValor = 0;

    productos.forEach((p) => {
      const categoriaNombre = categoriasMap.get(p.categoria_id) || 'N/A';
      const statusLabel = p.activo ? 'Activo' : 'Inactivo';
      const statusColor = p.activo ? '#4CAF50' : '#F44336';
      const stockColor = p.stock_actual === 0 ? '#F44336' : p.stock_actual <= 5 ? '#FFC107' : '#333';
      const precioUnitario = Number(p.precio_unitario || (p as any).precio || 0);
      const valorTotalItem = Number(p.stock_actual || 0) * precioUnitario;
      totalValor += valorTotalItem;

      const precioFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(precioUnitario);
      const valorTotalFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valorTotalItem);

      tableRows += `
        <tr>
          <td>${p.sku_interno || 'N/A'}</td>
          <td style="font-weight: bold;">${p.nombre_oficial || 'N/A'}</td>
          <td>${categoriaNombre}</td>
          <td style="text-align: right; font-weight: bold; color: ${stockColor};">${p.stock_actual} pzas</td>
          <td style="text-align: right; color: #555;">${precioFmt}</td>
          <td style="text-align: right; font-weight: bold; color: #0d1b2a;">${valorTotalFmt}</td>
          <td><span style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></td>
        </tr>
      `;
    });

    const totalStock = productos.reduce((sum, p) => sum + Number(p.stock_actual || 0), 0);
    const activeProducts = productos.filter((p) => p.activo).length;
    const totalValorFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalValor);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 15mm;
            }
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 38px;
            letter-spacing: 1px;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: none;">
          <tr>
            <td style="border: none; padding: 0; vertical-align: top;">
              <h1 class="title">${title}</h1>
              ${periodo ? `<div style="font-size: 12px; font-weight: bold; color: #0284c7; margin-top: 2px;">Período: ${periodo}</div>` : ''}
              <div class="subtitle">Generado el ${new Date().toLocaleDateString('es-MX')} - ${branding.name}</div>
            </td>
            <td style="border: none; padding: 0; text-align: right; vertical-align: top;">
              ${
                branding.logo
                  ? `<img src="${branding.logo}" style="max-height: 50px; max-width: 180px; object-fit: contain;" />`
                  : `<div class="logo-brand">${branding.name}</div>`
              }
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 25%; padding-right: 6px; border: none;">
              <div class="summary-card">
                <div class="label">Total Artículos Catálogo</div>
                <div class="value">${productos.length}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 3px; padding-right: 3px; border: none;">
              <div class="summary-card">
                <div class="label">Productos Activos</div>
                <div class="value" style="color: #4CAF50;">${activeProducts}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 3px; padding-right: 3px; border: none;">
              <div class="summary-card">
                <div class="label">Total Existencias Stock</div>
                <div class="value" style="color: #1b4965;">${totalStock} pzas</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 6px; border: none;">
              <div class="summary-card">
                <div class="label">Valor Total Inventario</div>
                <div class="value" style="color: #2e7d32;">${totalValorFmt}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 13%">SKU</th>
              <th style="width: 32%">Nombre Oficial</th>
              <th style="width: 15%">Categoría</th>
              <th style="width: 10%; text-align: right;">Stock</th>
              <th style="width: 12%; text-align: right;">P. Unitario</th>
              <th style="width: 12%; text-align: right;">Valor Total</th>
              <th style="width: 6%">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background-color: #f1f3f5; font-weight: bold; border-top: 2px solid #0d1b2a;">
              <td colspan="3">VALOR TOTAL CONSOLIDADO DE INVENTARIO</td>
              <td style="text-align: right;">${totalStock} pzas</td>
              <td style="text-align: right;">-</td>
              <td style="text-align: right; color: #0d1b2a;">${totalValorFmt} MXN</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Inventario - Sistema Automatizado
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_inventario_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Inventario PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating inventory PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de inventario.');
    }
  },

  /**
   * Genera un reporte PDF del historial de consumos y lo comparte
   */
  async exportConsumosToPDF(
    consumos: any[],
    title: string = 'Reporte de Consumos de Materiales',
    periodo?: string
  ): Promise<void> {
    if (consumos.length === 0) {
      throw new Error('No hay registros de consumo para exportar.');
    }
    const branding = await getCompanyBranding();

    // Identificar IDs de usuarios faltantes para buscar sus nombres si no vienen precargados
    const missingUserIds = new Set<string>();
    consumos.forEach((c) => {
      const hasName = c.usuario?.nombre || c.empleado?.nombre || c.empleado_nombre || c.usuario_nombre;
      if (!hasName) {
        if (c.creado_por && typeof c.creado_por === 'string' && c.creado_por.length > 10) missingUserIds.add(c.creado_por);
        if (c.empleado_id && typeof c.empleado_id === 'string' && c.empleado_id.length > 10) missingUserIds.add(c.empleado_id);
      }
    });

    const userNamesMap = new Map<string, string>();
    if (missingUserIds.size > 0) {
      try {
        const client = CompanyService.getActiveCompany() === 'daravisa' ? daravisaClient : inttecClient;
        const { data: usersData } = await client
          .from('usuarios')
          .select('id, nombre')
          .in('id', Array.from(missingUserIds));

        if (usersData) {
          usersData.forEach((u: any) => {
            if (u.id && u.nombre) userNamesMap.set(u.id, u.nombre);
          });
        }
      } catch (err) {
        console.warn('[reportGenerator] Error resolving user names for consumos PDF:', err);
      }
    }

    let tableRows = '';
    consumos.forEach((c) => {
      const fecha = c.fecha ? c.fecha.split('T')[0] : '';
      const productoNombre = c.producto?.nombre_oficial || 'Producto Eliminado';
      const sku = c.producto?.sku_interno ? ` (${c.producto.sku_interno})` : '';
      const userId = c.creado_por || c.empleado_id;
      const empleadoNombre =
        c.usuario?.nombre ||
        c.empleado?.nombre ||
        c.empleado_nombre ||
        c.usuario_nombre ||
        (userId ? userNamesMap.get(userId) : null) ||
        'No especificado / Almacén';
      const cantidad = c.cantidad || 0;
      const referencia = c.folio_factura || c.motivo || 'N/A';

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td style="font-weight: bold;">${productoNombre}<span style="font-size: 10px; color: #666; font-weight: normal;">${sku}</span></td>
          <td style="color: #0d1b2a; font-weight: 700;">👤 ${empleadoNombre}</td>
          <td style="text-align: right; font-weight: bold; color: #F44336;">-${cantidad} pzas</td>
          <td>${referencia}</td>
        </tr>
      `;
    });

    const totalConsumos = consumos.length;
    const totalPzasConsumidas = consumos.reduce((sum, c) => sum + Number(c.cantidad), 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter;
              margin: 15mm;
            }
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 15px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
          }
          .summary-card .label {
            font-size: 10px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 11px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-weight: 600;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .logo-brand {
            font-weight: 900;
            font-style: italic;
            font-size: 38px;
            color: #0d1b2a;
            line-height: 1;
            letter-spacing: 0.5px;
          }
          .logo-tagline {
            font-weight: 700;
            font-size: 7px;
            color: #777;
            letter-spacing: 0.8px;
            margin-top: 2px;
            text-transform: uppercase;
          }
          .logo-img {
            width: 300px;
            height: 100px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              ${periodo ? `<p style="margin: 4px 0 0 0; font-size: 13px; font-weight: bold; color: #0284c7;">Período: ${periodo}</p>` : ''}
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: none;">
          <tr>
            <td style="width: 50%; padding-right: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Operaciones Consumo</div>
                <div class="value">${totalConsumos}</div>
              </div>
            </td>
            <td style="width: 50%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Piezas Consumidas</div>
                <div class="value" style="color: #F44336;">-${totalPzasConsumidas}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">Fecha</th>
              <th style="width: 30%">Producto</th>
              <th style="width: 26%">Retirado Por (Empleado)</th>
              <th style="width: 12%; text-align: right;">Cantidad</th>
              <th style="width: 20%">Referencia / Motivo</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Historial de Consumos - Sistema Automatizado
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      const pdfFileName = `reporte_consumos_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      await writeAsStringAsync(safeUri, await (await fetch(uri)).text(), {
        encoding: EncodingType.UTF8,
      }).catch(() => {});

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Consumos PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating consumos PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de consumos.');
    }
  },

  /**
   * Genera un reporte PDF consolidado del historial de retiros de material y lo comparte
   */
  async exportRetirosToPDF(
    retiros: any[],
    title: string = 'Reporte de Retiros de Material',
    periodo?: string
  ): Promise<void> {
    if (retiros.length === 0) {
      throw new Error('No hay retiros registrados para exportar.');
    }
    const branding = await getCompanyBranding();

    const totalRetiros = retiros.length;
    let totalPiezas = 0;
    const tiposCount: Record<string, number> = { Servicio: 0, Proyecto: 0, Venta: 0, Operativo: 0 };

    retiros.forEach((r) => {
      const tipo = r.tipo_gasto || 'Operativo';
      tiposCount[tipo] = (tiposCount[tipo] || 0) + 1;
      const mats = Array.isArray(r.materiales) ? r.materiales : [];
      mats.forEach((m: any) => {
        totalPiezas += Number(m.cantidad || 0);
      });
    });

    let tableRows = '';
    retiros.forEach((r) => {
      const fecha = r.created_at ? new Date(r.created_at).toLocaleString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'N/A';

      const mats = Array.isArray(r.materiales) ? r.materiales : [];
      const matsHtml = mats.map((m: any) => 
        `<div style="margin-bottom: 3px;"><strong>${m.cantidad} ${m.unidad || 'pza'}</strong> - ${m.nombre || 'Producto'} <span style="color: #666; font-size: 9px;">(${m.sku || '-'})</span></div>`
      ).join('');

      let tipoBadgeColor = '#4B5563';
      if (r.tipo_gasto === 'Servicio') tipoBadgeColor = '#2563EB';
      else if (r.tipo_gasto === 'Proyecto') tipoBadgeColor = '#7C3AED';
      else if (r.tipo_gasto === 'Venta') tipoBadgeColor = '#059669';
      else if (r.tipo_gasto === 'Operativo') tipoBadgeColor = '#D97706';

      let clienteDisplay = r.cliente_nombre || '-';
      if (r.is_split) {
        clienteDisplay = `<span style="color: #7C3AED; font-weight: bold;">[Dividido en varios clientes]</span>`;
      } else if (r.sucursal_nombre) {
        clienteDisplay += `<br/><small style="color: #666;">Suc: ${r.sucursal_nombre}</small>`;
      }

      tableRows += `
        <tr>
          <td style="white-space: nowrap; font-size: 10px;">${fecha}</td>
          <td><strong>${r.empleado_nombre || 'Desconocido'}</strong></td>
          <td><span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; color: #fff; background-color: ${tipoBadgeColor};">${r.tipo_gasto || 'Operativo'}</span></td>
          <td>${clienteDisplay}</td>
          <td style="font-size: 10px;">
            ${r.detalle_servicio_proyecto ? `<strong>Detalle:</strong> ${r.detalle_servicio_proyecto}<br/>` : ''}
            ${r.motivo ? `<strong>Motivo:</strong> ${r.motivo}<br/>` : ''}
            ${r.proveedor ? `<small style="color: #666;">Prov: ${r.proveedor}</small>` : ''}
          </td>
          <td style="font-size: 10px;">${matsHtml || '<span style="color: #999;">Sin partidas</span>'}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter landscape;
              margin: 10mm;
            }
          }
          .title {
            color: #0d1b2a;
            font-size: 22px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #666;
            font-size: 11px;
            margin: 4px 0 0 0;
          }
          .summary-card {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 10px 14px;
            text-align: center;
          }
          .summary-card .label {
            font-size: 10px;
            color: #6c757d;
            text-transform: uppercase;
            font-weight: 600;
          }
          .summary-card .value {
            font-size: 18px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 2px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10.5px;
          }
          table.data-table th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 8px 6px;
            font-weight: 600;
          }
          table.data-table td {
            padding: 8px 6px;
            border-bottom: 1px solid #e9ecef;
            vertical-align: top;
          }
          table.data-table tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 9px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 10px;
          }
          .logo-img {
            width: 240px;
            height: 70px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 10px; margin-bottom: 15px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title">${title}</h1>
              ${periodo ? `<p style="margin: 4px 0 0 0; font-size: 12px; font-weight: bold; color: #0284c7;">Período: ${periodo}</p>` : ''}
              <p class="subtitle">Generado el: ${new Date().toLocaleString('es-MX')}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <img class="logo-img" src="${branding.logo}" />
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: none;">
          <tr>
            <td style="width: 25%; padding-right: 6px; border: none;">
              <div class="summary-card">
                <div class="label">Total Retiros</div>
                <div class="value">${totalRetiros}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 3px; padding-right: 3px; border: none;">
              <div class="summary-card">
                <div class="label">Unidades Retiradas</div>
                <div class="value" style="color: #2563EB;">${Math.round(totalPiezas * 100) / 100}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 3px; padding-right: 3px; border: none;">
              <div class="summary-card">
                <div class="label">Servicios / Proyectos</div>
                <div class="value" style="color: #7C3AED;">${(tiposCount.Servicio || 0) + (tiposCount.Proyecto || 0)}</div>
              </div>
            </td>
            <td style="width: 25%; padding-left: 6px; border: none;">
              <div class="summary-card">
                <div class="label">Ventas / Operativos</div>
                <div class="value" style="color: #059669;">${(tiposCount.Venta || 0) + (tiposCount.Operativo || 0)}</div>
              </div>
            </td>
          </tr>
        </table>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 13%">Fecha / Hora</th>
              <th style="width: 14%">Empleado</th>
              <th style="width: 10%">Tipo</th>
              <th style="width: 18%">Cliente / Sucursal</th>
              <th style="width: 20%">Detalle / Motivo</th>
              <th style="width: 25%">Materiales Retirados</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Oficial - Control de Inventario y Retiros de Material - Sistema Automatizado ${branding.name}
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_retiros_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Retiros PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating retiros PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de retiros.');
    }
  },

  /**
   * Genera un Vale de Salida de Almacén individual en PDF para un retiro específico
   */
  async exportSingleRetiroValePDF(retiro: any): Promise<void> {
    if (!retiro) throw new Error('No se especificó la información del retiro.');
    const branding = await getCompanyBranding();

    const fechaStr = retiro.created_at ? new Date(retiro.created_at).toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'N/A';

    const mats = Array.isArray(retiro.materiales) ? retiro.materiales : [];
    let matsRows = '';
    mats.forEach((m: any, idx: number) => {
      matsRows += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${m.sku || '-'}</strong></td>
          <td>${m.nombre || 'Producto'}</td>
          <td style="text-align: right; font-weight: bold;">${m.cantidad}</td>
          <td style="text-align: center;">${m.unidad || 'pza'}</td>
        </tr>
      `;
    });

    let clientDetail = retiro.cliente_nombre || 'N/A';
    if (retiro.is_split) {
      clientDetail = 'Múltiples clientes (Dividido)';
    } else if (retiro.sucursal_nombre) {
      clientDetail += ` (Sucursal: ${retiro.sucursal_nombre})`;
    }

    const folioStr = retiro.id ? retiro.id.substring(0, 8).toUpperCase() : `RET-${Date.now().toString().slice(-6)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Vale de Salida de Material - ${folioStr}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 30px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter portrait;
            margin: 15mm;
          }
          .vale-box {
            border: 2px solid #0d1b2a;
            border-radius: 8px;
            padding: 20px;
          }
          .title {
            color: #0d1b2a;
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 0;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .info-table td {
            padding: 6px 4px;
            font-size: 11px;
            vertical-align: top;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 11px;
          }
          .items-table th {
            background-color: #0d1b2a;
            color: white;
            padding: 8px;
            text-align: left;
          }
          .items-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
          }
          .items-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .signatures-table {
            width: 100%;
            margin-top: 30px;
            border-collapse: collapse;
          }
          .signature-box {
            width: 60%;
            text-align: center;
            font-size: 11px;
            margin: 0 auto;
          }
          .sig-image-container {
            height: 60px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            margin-bottom: 2px;
          }
          .sig-line {
            border-top: 1.5px solid #0d1b2a;
            width: 100%;
            margin: 0 0 6px 0;
          }
          .logo-img {
            width: 220px;
            height: 60px;
            object-fit: contain;
          }
          .no-print { margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px; }
          .btn-download {
            background-color: #0d1b2a;
            color: #ffffff;
            border: none;
            padding: 10px 18px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: background-color 0.2s;
          }
          .btn-download:hover { background-color: #1e3a5f; }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0 !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button class="btn-download" onclick="window.print()">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
            Descargar / Imprimir PDF
          </button>
        </div>
        <div class="vale-box">
          <table style="width: 100%; border-bottom: 2px solid #0d1b2a; padding-bottom: 10px; margin-bottom: 10px; border-collapse: collapse;">
            <tr>
              <td>
                <div class="title">Vale de Salida y Carta Responsiva de Material</div>
                <div style="font-size: 12px; font-weight: bold; color: #2563EB; margin-top: 3px;">Folio: #${folioStr}</div>
              </td>
              <td style="text-align: right;">
                <img class="logo-img" src="${branding.logo}" />
              </td>
            </tr>
          </table>

          <table class="info-table">
            <tr>
              <td style="width: 50%;"><strong>Empleado Solicitante:</strong> ${retiro.empleado_nombre || 'Desconocido'}</td>
              <td style="width: 50%;"><strong>Fecha y Hora:</strong> ${fechaStr}</td>
            </tr>
            <tr>
              <td><strong>Tipo de Destino:</strong> ${retiro.tipo_gasto || 'Operativo'}</td>
              <td><strong>Cliente / Destino:</strong> ${clientDetail}</td>
            </tr>
            ${retiro.detalle_servicio_proyecto ? `<tr><td colspan="2"><strong>Detalle de Servicio o Proyecto:</strong> ${retiro.detalle_servicio_proyecto}</td></tr>` : ''}
            ${retiro.motivo ? `<tr><td colspan="2"><strong>Motivo / Referencia:</strong> ${retiro.motivo}</td></tr>` : ''}
            ${retiro.proveedor ? `<tr><td colspan="2"><strong>Proveedor / Comercio:</strong> ${retiro.proveedor}</td></tr>` : ''}
          </table>

          <div style="font-weight: bold; font-size: 12px; margin-top: 10px; color: #0d1b2a;">MATERIALES RETIRADOS:</div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 8%; text-align: center;">#</th>
                <th style="width: 22%;">SKU</th>
                <th style="width: 46%;">Descripción del Material</th>
                <th style="width: 12%; text-align: right;">Cantidad</th>
                <th style="width: 12%; text-align: center;">Unidad</th>
              </tr>
            </thead>
            <tbody>
              ${matsRows || '<tr><td colspan="5" style="text-align:center; color:#888;">Sin partidas</td></tr>'}
            </tbody>
          </table>

          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-top: 25px; font-size: 10px; color: #334155; line-height: 1.4;">
            <strong style="color: #0d1b2a; text-transform: uppercase; font-size: 10px; display: block; margin-bottom: 4px;">
              Compromiso de Resguardo y Carta Responsiva de Material
            </strong>
            Por medio de la presente, el trabajador manifiesta recibir en óptimas condiciones y a entera satisfacción los materiales y equipos especificados, comprometiéndose a destinarlos única y exclusivamente a las actividades laborales asignadas por <strong>${branding.name}</strong>, asumiendo la custodia, conservación y responsabilidad de devolución de sobrantes o herramientas al término de los trabajos.
          </div>

          <table class="signatures-table">
            <tr>
              <td style="width: 20%;"></td>
              <td class="signature-box" style="width: 60%;">
                <div class="sig-image-container">
                  ${retiro.firma_base64 || retiro.firma_url || retiro.firma ? `
                    <img src="${retiro.firma_base64 || retiro.firma_url || retiro.firma}" style="max-height: 58px; max-width: 200px; object-fit: contain;" />
                  ` : '<div style="height: 45px;"></div>'}
                </div>
                <div class="sig-line"></div>
                <strong>TRABAJADOR / RESPONSABLE RECEPTOR</strong><br/>
                <span>${retiro.empleado_nombre || 'Empleado Responsable'}</span>
                ${retiro.firmado_en || retiro.firma_base64 ? `
                  <div style="font-size: 9px; color: #64748b; margin-top: 4px;">
                    Firmado digitalmente: ${retiro.firmado_en ? new Date(retiro.firmado_en).toLocaleString('es-MX') : fechaStr}
                  </div>
                ` : ''}
              </td>
              <td style="width: 20%;"></td>
            </tr>
          </table>

          <div style="text-align: center; font-size: 9px; color: #888; margin-top: 30px;">
            Este documento ampara la entrega y responsabilidad del material especificado perteneciente a ${branding.name}.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `vale_retiro_${folioStr}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Compartir Vale de Retiro ${folioStr}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating vale retiro PDF:', error);
      throw new Error(error.message || 'Error al generar el vale de retiro.');
    }
  },


  /**
   * Genera un reporte PDF de las ventas registradas y lo comparte
   */
  async exportVentasToPDF(
    ventas: any[],
    title: string = 'Reporte de Ventas',
    periodo?: string
  ): Promise<void> {
    if (ventas.length === 0) {
      throw new Error('No hay registros de ventas para exportar.');
    }

    const branding = await getCompanyBranding();

    const formatCurr = (val: number) =>
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

    const totalFacturado = ventas.reduce((sum, v) => sum + Number(v.precio_total_facturado || v.total || 0), 0);
    const totalCostoPartidas = ventas.reduce((sum, v) => sum + Number(v.costo_total || 0), 0);
    const totalGastosVinculados = ventas.reduce((sum, v) => sum + Number(v.gastos_vinculados_total || 0), 0);
    const totalCostoReal = totalCostoPartidas + totalGastosVinculados;
    const totalUtilidadReal = totalFacturado - totalCostoReal;
    const margenRealConsolidado = totalFacturado > 0 ? (totalUtilidadReal / totalFacturado) * 100 : 0;

    let tableRows = '';
    ventas.forEach((v) => {
      const fecha = v.fecha || (v.created_at ? v.created_at.split('T')[0] : '');
      const precioFacturado = Number(v.precio_total_facturado || v.total || 0);
      const costoPartidas = Number(v.costo_total || 0);
      const gastosVinc = Number(v.gastos_vinculados_total || 0);
      const costoTotalReal = v.costo_total_real !== undefined ? Number(v.costo_total_real) : (costoPartidas + gastosVinc);
      const utilidadReal = v.utilidad_real !== undefined ? Number(v.utilidad_real) : (precioFacturado - costoTotalReal);
      const margenReal = v.margen_real_porcentual !== undefined 
        ? Number(v.margen_real_porcentual) 
        : (precioFacturado > 0 ? (utilidadReal / precioFacturado) : 0);

      const facturadoFormatted = formatCurr(precioFacturado);
      const costoPartidasFormatted = formatCurr(costoPartidas);
      const gastosVincFormatted = formatCurr(gastosVinc);
      const costoTotalRealFormatted = formatCurr(costoTotalReal);
      const utilidadRealFormatted = formatCurr(utilidadReal);
      const margenPercent = (margenReal * 100).toFixed(1) + '%';
      const isProfit = utilidadReal >= 0;

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>
            <div style="font-weight: bold;">${v.cliente_nombre || v.cliente || 'N/A'}</div>
            ${v.factura_referencia ? `<span style="font-size: 9px; color: #777;">Ref: ${v.factura_referencia}</span>` : ''}
          </td>
          <td>${v.tipo_proyecto || 'N/A'}</td>
          <td>${v.sucursal || 'N/A'}</td>
          <td>${v.proveedor || 'N/A'}</td>
          <td style="text-align: right; color: #0d1b2a; font-weight: bold;">${facturadoFormatted}</td>
          <td style="text-align: right; color: #64748b;">${costoPartidasFormatted}</td>
          <td style="text-align: right; color: ${gastosVinc > 0 ? '#d97706' : '#94a3b8'}; font-weight: ${gastosVinc > 0 ? 'bold' : 'normal'};">${gastosVincFormatted}</td>
          <td style="text-align: right; color: #ef4444; font-weight: 600;">${costoTotalRealFormatted}</td>
          <td style="text-align: right; color: ${isProfit ? '#10b981' : '#ef4444'}; font-weight: bold;">${utilidadRealFormatted}</td>
          <td style="text-align: right; color: ${isProfit ? '#10b981' : '#ef4444'}; font-weight: bold;">${margenPercent}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: letter landscape;
              margin: 10mm;
            }
          }
          .title {
            color: #0d1b2a;
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .subtitle {
            color: #777;
            font-size: 12px;
            margin-top: 5px;
          }
          .summary-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 12px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
          }
          .summary-card .value {
            font-size: 15px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 4px;
          }
          .summary-card .label {
            font-size: 9px;
            text-transform: uppercase;
            color: #888;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10.5px;
          }
          th {
            background-color: #0d1b2a;
            color: white;
            text-align: left;
            padding: 8px 6px;
            font-weight: 600;
          }
          td {
            padding: 8px 6px;
            border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
            background-color: #fcfcfd;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #aaa;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              ${periodo ? `<p style="margin: 4px 0 0 0; font-size: 13px; font-weight: bold; color: #0284c7;">Período: ${periodo}</p>` : ''}
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <img src="${branding.logo}" style="width: 300px; height: 100px; object-fit: contain;" />
            </td>
          </tr>
        </table>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Facturado</div>
            <div class="value" style="color: #0d1b2a;">${formatCurr(totalFacturado)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Costo Insumos</div>
            <div class="value" style="color: #64748b;">${formatCurr(totalCostoPartidas)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Gastos Vinculados</div>
            <div class="value" style="color: #d97706;">${formatCurr(totalGastosVinculados)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Costo Total Real</div>
            <div class="value" style="color: #ef4444;">${formatCurr(totalCostoReal)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Utilidad Real</div>
            <div class="value" style="color: ${totalUtilidadReal >= 0 ? '#10b981' : '#ef4444'};">${formatCurr(totalUtilidadReal)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Margen Real</div>
            <div class="value" style="color: ${totalUtilidadReal >= 0 ? '#10b981' : '#ef4444'};">${margenRealConsolidado.toFixed(1)}%</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 8%">Fecha</th>
              <th style="width: 15%">Cliente / Ref</th>
              <th style="width: 8%">Tipo</th>
              <th style="width: 8%">Sucursal</th>
              <th style="width: 9%">Proveedor</th>
              <th style="width: 9%; text-align: right;">Venta</th>
              <th style="width: 8%; text-align: right;">Insumos</th>
              <th style="width: 9%; text-align: right;">Gastos Vinc.</th>
              <th style="width: 9%; text-align: right;">Costo Real</th>
              <th style="width: 9%; text-align: right;">Util. Real</th>
              <th style="width: 8%; text-align: right;">Margen</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Ventas e Ingresos - Sistema Automatizado
        </div>
      </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
        return;
      }

      const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const pdfFileName = `reporte_ventas_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Ventas PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating sales PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de ventas.');
    }
  },
    async exportMovimientosToXLSX(movimientos: any[], filename: string = 'reporte_movimientos_inventario.xlsx'): Promise<void> {

            if (movimientos.length === 0) {
              throw new Error('No hay movimientos para exportar.');
            }
            const headers = [ 'ID', 'Fecha', 'Tipo', 'Subtipo', 'SKU', 'Producto', 'Cantidad', 'Unidad', 'Responsable / Usuario', 'Proveedor', 'Cliente', 'Tipo de Gasto', 'Folio / Concepto / Detalle' ];
            const rows = movimientos.map(m => [
              m.id,
              m.fecha ? new Date(m.fecha).toISOString().replace('T', ' ').substring(0, 19) : '',
              m.tipo || 'MOVIMIENTO',
              m.subtipo || m.tipo || '',
              m.producto_sku || '-',
              m.producto_nombre || 'Producto',
              m.cantidad || 0,
              m.producto_unidad || 'pza',
              m.usuario?.nombre || m.empleado?.nombre || m.usuario_nombre || m.empleado_nombre || 'Almacén',
              m.proveedor_nombre || '',
              m.cliente_nombre || '',
              m.tipo_gasto || '',
              m.detalle_motivo || m.folio_factura || ''
            ]);
            await ReportGenerator._exportArrayToXLSX('Movimientos', headers, rows, filename);
    },
    async exportToXLSX(gastos: Gasto[], fileName: string = 'reporte_gastos.xlsx'): Promise<void> {

            if (gastos.length === 0) {
              throw new Error('No hay gastos para exportar.');
            }
            const headers = ['ID','Fecha','Empleado Nombre','Monto','Categoria','Subcategoria','Proveedor','Cliente','Servicio/Proyecto','Detalle','Sucursal','Venta Vinculada','Metodo Pago','Tipo Tarjeta','Estado Factura','Motivo Sin Factura','Status','Estado Reembolso','Comentarios'];
            const rows = gastos.map(g => {
              const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
              let estadoFactura = 'No Facturado';
              if (g.facturado === true) estadoFactura = 'Facturado';
              else if (g.motivo_sin_factura === 'PENDIENTE_ENTREGA' || g.motivo_sin_factura?.toLowerCase().includes('pendiente')) estadoFactura = 'Pendiente de Entregar';
              const commentText = g.justificacion ? g.justificacion.replace(/\[[\s\S]*?\]/g, '').trim() : '';
              const estadoReembolso = g.estado_reembolso === 'REEMBOLSADO' ? 'Reembolsado' : 'No';
              const ventaVinc = g.venta_id ? `Venta #${String(g.venta_id).slice(0, 8)}` : 'Sin Venta';
              return [ g.id, fecha, g.empleado_nombre, g.monto, GastoHelper.getCategoria(g), GastoHelper.getSubcategoria(g), GastoHelper.getProveedor(g), GastoHelper.getCliente(g), g.tipo_servicio_proyecto, g.detalle_servicio_proyecto, GastoHelper.getSucursal(g), ventaVinc, g.metodo_pago, g.tipo_tarjeta, estadoFactura, g.motivo_sin_factura, g.status, estadoReembolso, commentText ];
            });
            await ReportGenerator._exportArrayToXLSX('Gastos', headers, rows, fileName);
    },
    async exportGasolinaToXLSX(registros: any[], fileName: string = 'reporte_gasolina.xlsx'): Promise<void> {

            if (registros.length === 0) {
              throw new Error('No hay registros para exportar.');
            }
            const headers = ['Fecha','Empresa Registradora','Conductor','Vehículo Marca','Vehículo Modelo','Placas','Km Anterior','Km Actual','Distancia Recorrida (km)','Litros','Rendimiento (km/L)','Costo Total (MXN)','Observaciones'];
            const rows = registros.map(r => {
              const fecha = r.fecha_carga || r.created_at?.split('T')[0] || '';
              const distancia = Number(r.kilometraje) - Number(r.kilometraje_anterior || r.kilometraje);
              const litros = Number(r.litros_cargados) || 0;
              const rendimiento = litros > 0 && distancia > 0 ? (distancia / litros).toFixed(2) : '0.00';
              return [ fecha, r.empresa_origen || 'N/A', r.empleado_nombre || 'Desconocido', r.vehiculo_marca || 'N/A', r.vehiculo_modelo || 'N/A', r.vehiculo_placas || 'N/A', r.kilometraje_anterior || r.kilometraje, r.kilometraje, distancia, litros, rendimiento, Number(r.monto_total || 0).toFixed(2), r.observaciones || '' ];
            });
            await ReportGenerator._exportArrayToXLSX('Gasolina', headers, rows, fileName);
    },
    async exportAsistenciasToXLSX(asistencias: any[], personal: Usuario[] = [], fileName: string = 'reporte_asistencia.xlsx'): Promise<void> {

            if (asistencias.length === 0) {
              throw new Error('No hay asistencias para exportar.');
            }
            const empleadosMap = new Map((personal || []).map((p) => [p.id, p.nombre]));
            const headers = ['ID','Fecha','Empleado Nombre','Empresa','Hora Entrada','Dirección Entrada','Hora Salida','Dirección Salida'];
            const rows = asistencias.map(a => {
              const empleadoNombre =
                empleadosMap.get(a.empleado_id) ||
                empleadosMap.get(a.usuario_id) ||
                (a.empleados ? `${a.empleados.nombre || ''} ${a.empleados.apellidos || ''}`.trim() : null) ||
                (a.empleado ? `${a.empleado.nombre || ''} ${a.empleado.apellidos || ''}`.trim() : null) ||
                a.empleado_nombre ||
                a.usuario_nombre ||
                'Desconocido';
              return [ a.id, a.fecha, empleadoNombre, a.empresa_origen || 'N/A', a.hora_entrada || 'Sin registro', a.direccion_entrada || '', a.hora_salida || 'Sin registro', a.direccion_salida || '' ];
            });
            await ReportGenerator._exportArrayToXLSX('Asistencias', headers, rows, fileName);
    },

    /**
     * Exporta el Reporte General de Asistencia Semanal en formato Excel XLSX
     * Incluye resumen por empleado, horas totales de la semana y el subíndice detallado de cada turno por día
     */
    async exportReporteAsistenciaSemanalGeneralXLSX(
      asistencias: Asistencia[],
      personal: Usuario[],
      weekMondayInput?: Date | string,
      fileName?: string
    ): Promise<void> {
      const range = getWeekRange(weekMondayInput);
      const asistenciasPorEmpleado = new Map<string, Asistencia[]>();
      for (const a of asistencias) {
        const empId = a.empleado_id;
        if (!empId) continue;
        const list = asistenciasPorEmpleado.get(empId) || [];
        list.push(a);
        asistenciasPorEmpleado.set(empId, list);
      }

      const personalTarget = (personal || []).filter(
        p => p.rol === 'EMPLEADO' || p.rol === 'ADMIN' || asistenciasPorEmpleado.has(p.id)
      );

      const headers = [
        'Semana',
        'Empleado',
        'Rol',
        'Sucursal',
        'Fecha',
        'Día',
        'Subíndice Turno',
        'Hora Entrada',
        'Dirección Entrada',
        'Hora Salida',
        'Dirección Salida',
        'Duración Turno',
        'Regulares Turno',
        'Extras Turno',
        'Total Horas Día',
        'Extras Día',
        'Total Horas Semana',
        'Total Regulares Semana',
        'Total Extras Semana'
      ];

      const rows: any[][] = [];

      for (const emp of personalTarget) {
        const asistenciasEmp = asistenciasPorEmpleado.get(emp.id) || [];
        const semanaData = processAsistenciasSemana(asistenciasEmp, range.mondayDate);

        let tieneRegistros = false;
        for (const dia of semanaData.dias) {
          if (dia.turnos.length > 0) {
            tieneRegistros = true;
            for (const turno of dia.turnos) {
              rows.push([
                range.label,
                emp.nombre,
                emp.rol || 'EMPLEADO',
                emp.sucursal || 'N/A',
                dia.dateStr,
                dia.dayName,
                `Turno #${turno.index}`,
                turno.hora_entrada,
                turno.direccion_entrada || '',
                turno.hora_salida || 'Pendiente',
                turno.direccion_salida || '',
                turno.duracionStr,
                turno.horasRegularesStr,
                turno.horasExtraStr,
                dia.totalHorasStr,
                dia.horasExtraStr,
                semanaData.totalHorasSemanaStr,
                semanaData.totalHorasRegularesStr,
                semanaData.totalHorasExtraStr
              ]);
            }
          }
        }

        if (!tieneRegistros) {
          rows.push([
            range.label,
            emp.nombre,
            emp.rol || 'EMPLEADO',
            emp.sucursal || 'N/A',
            '-',
            '-',
            'Sin registros',
            '-',
            '',
            '-',
            '',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m'
          ]);
        }
      }

      const targetFileName = fileName || `reporte_asistencia_general_${range.mondayStr}.xlsx`;
      await ReportGenerator._exportArrayToXLSX('Asistencia General', headers, rows, targetFileName);
    },

    /**
     * Exporta el Reporte Individual de Asistencia Semanal en formato Excel XLSX para un empleado
     */
    async exportReporteAsistenciaEmpleadoXLSX(
      asistencias: Asistencia[],
      empleado: Usuario,
      weekMondayInput?: Date | string,
      fileName?: string
    ): Promise<void> {
      const range = getWeekRange(weekMondayInput);
      const semanaData = processAsistenciasSemana(asistencias, range.mondayDate);

      const headers = [
        'Semana',
        'Empleado',
        'Fecha',
        'Día',
        'Turno #',
        'Hora Entrada',
        'Dirección Entrada',
        'Hora Salida',
        'Dirección Salida',
        'Duración Turno',
        'Regulares Turno',
        'Extras Turno',
        'Total Horas Día',
        'Extras Día',
        'Total Horas Semana',
        'Total Extras Semana'
      ];

      const rows: any[][] = [];

      for (const dia of semanaData.dias) {
        if (dia.turnos.length > 0) {
          for (const turno of dia.turnos) {
            rows.push([
              range.label,
              empleado.nombre,
              dia.dateStr,
              dia.dayName,
              `Turno #${turno.index}`,
              turno.hora_entrada,
              turno.direccion_entrada || '',
              turno.hora_salida || 'Pendiente',
              turno.direccion_salida || '',
              turno.duracionStr,
              turno.horasRegularesStr,
              turno.horasExtraStr,
              dia.totalHorasStr,
              dia.horasExtraStr,
              semanaData.totalHorasSemanaStr,
              semanaData.totalHorasExtraStr
            ]);
          }
        } else {
          rows.push([
            range.label,
            empleado.nombre,
            dia.dateStr,
            dia.dayName,
            '-',
            '-',
            '',
            '-',
            '',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            '0h 0m',
            semanaData.totalHorasSemanaStr,
            semanaData.totalHorasExtraStr
          ]);
        }
      }

      const safeName = (empleado.nombre || 'empleado').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const targetFileName = fileName || `reporte_asistencia_${safeName}_${range.mondayStr}.xlsx`;
      await ReportGenerator._exportArrayToXLSX('Asistencia Semanal', headers, rows, targetFileName);
    },
    async exportInventarioToXLSX(productos: any[], categorias: ReportCategoria[], fileName: string = 'reporte_inventario.xlsx'): Promise<void> {

            if (productos.length === 0) {
              throw new Error('No hay productos para exportar.');
            }
            const headers = ['ID','SKU','Producto','Categoría','Unidad','Stock Actual (Nuevo)','Stock Usado','Stock Por Revisar','Stock Total Sumado','Punto Reorden','Ubicación','Precio Unit.', 'Valor Total', 'Estado (Activo)'];
            const rows = productos.map(p => {
              const categoriaNombre = categorias.find((c: any) => c.id === p.categoria_id)?.nombre || 'Sin Categoría';
              const sNuevo = Number(p.stock_nuevo || 0);
              const sUsado = Number(p.stock_usado || 0);
              const sRevision = Number(p.stock_por_revisar || 0);
              const totalStock = sNuevo + sUsado + sRevision;
              const precioUnitario = Number(p.precio_unitario || 0);
              const valorTotal = totalStock * precioUnitario;
              const estado = p.activo !== false ? 'Activo' : 'Inactivo';
              return [ p.id, p.sku_interno || '-', p.nombre_oficial || 'Producto', categoriaNombre, p.unidad_medida || 'pza', sNuevo, sUsado, sRevision, totalStock, p.punto_reorden || 0, p.ubicacion_almacen || '', precioUnitario, valorTotal, estado ];
            });
            await ReportGenerator._exportArrayToXLSX('Inventario', headers, rows, fileName);
    },
    async exportConsumosToXLSX(consumos: any[], fileName: string = 'reporte_consumos.xlsx'): Promise<void> {

            if (consumos.length === 0) {
              throw new Error('No hay consumos para exportar.');
            }

            // Identificar IDs de usuarios faltantes para buscar sus nombres si no vienen precargados
            const missingUserIds = new Set<string>();
            consumos.forEach((c) => {
              const hasName = c.usuario?.nombre || c.empleado?.nombre || c.empleado_nombre || c.usuario_nombre;
              if (!hasName) {
                if (c.creado_por && typeof c.creado_por === 'string' && c.creado_por.length > 10) missingUserIds.add(c.creado_por);
                if (c.empleado_id && typeof c.empleado_id === 'string' && c.empleado_id.length > 10) missingUserIds.add(c.empleado_id);
                if (c.usuario_id && typeof c.usuario_id === 'string' && c.usuario_id.length > 10) missingUserIds.add(c.usuario_id);
              }
            });

            const userNamesMap = new Map<string, string>();
            if (missingUserIds.size > 0) {
              try {
                const client = CompanyService.getActiveCompany() === 'daravisa' ? daravisaClient : inttecClient;
                const { data: usersData } = await client
                  .from('usuarios')
                  .select('id, nombre')
                  .in('id', Array.from(missingUserIds));

                if (usersData) {
                  usersData.forEach((u: any) => {
                    if (u.id && u.nombre) userNamesMap.set(u.id, u.nombre);
                  });
                }
              } catch (err) {
                console.warn('[reportGenerator] Error resolving user names for consumos XLSX:', err);
              }
            }

            const headers = ['ID','Fecha','Empleado Nombre','SKU','Producto','Categoría','Cantidad Consumida','Proyecto/Uso','Costo Estimado'];
            const rows = consumos.map(c => {
              const userId = c.creado_por || c.empleado_id || c.usuario_id;
              const empleadoNombre =
                c.usuario?.nombre ||
                c.empleado?.nombre ||
                c.empleado_nombre ||
                c.usuario_nombre ||
                (userId ? userNamesMap.get(userId) : null) ||
                'No especificado / Almacén';
              const sku = c.producto?.sku_interno || c.producto_sku || '-';
              const producto = c.producto?.nombre_oficial || c.producto_nombre || 'Producto';
              const categoria = c.categoria_nombre || c.producto?.categoria?.nombre || c.categoria || '';
              const detalle = c.detalle_motivo || c.folio_factura || c.motivo || '';
              const costo = c.costo_total !== undefined ? c.costo_total : ((Number(c.cantidad || 0) * Number(c.producto?.precio_unitario || 0)) || 0);

              return [
                c.id,
                c.fecha ? c.fecha.split('T')[0] : '',
                empleadoNombre,
                sku,
                producto,
                categoria,
                c.cantidad || 0,
                detalle,
                costo
              ];
            });
            await ReportGenerator._exportArrayToXLSX('Consumos', headers, rows, fileName);
    },
    async exportRetirosToXLSX(retiros: any[], fileName: string = 'reporte_retiros_material.xlsx'): Promise<void> {

            if (retiros.length === 0) {
              throw new Error('No hay retiros para exportar.');
            }
            const headers = ['ID','Fecha de Retiro','Empleado','Tipo Destino','Cliente','Sucursal','Proveedor','Detalle','Motivo','SKU','Herramienta','Estado Entrega','Cantidad Prestada','Unidad'];
            const rows = retiros.map(r => {
              const empleadoNombre = r.usuario?.nombre || r.empleado?.nombre || r.empleado_nombre || r.usuario_nombre || (typeof r.empleado === 'string' ? r.empleado : '') || 'Desconocido';
              return [ r.id, r.fecha ? r.fecha.split('T')[0] : '', empleadoNombre, r.tipo_gasto || 'Operativo', r.cliente_nombre || (r.is_split ? 'Dividido' : ''), r.sucursal_nombre || '', r.proveedor || '', r.detalle_servicio_proyecto || '', r.motivo || '', r.producto_sku || '-', r.producto_nombre || 'Herramienta', r.estado_entrega || 'NUEVA', r.cantidad || 0, r.producto_unidad || 'pza' ];
            });
            await ReportGenerator._exportArrayToXLSX('Retiros', headers, rows, fileName);
    },
    async exportVentasToXLSX(ventas: any[], fileName: string = 'reporte_ventas.xlsx'): Promise<void> {
            if (ventas.length === 0) {
              throw new Error('No hay ventas para exportar.');
            }
            const headers = [
              'ID',
              'Folio',
              'Fecha Creación',
              'Cliente',
              'Vendedor',
              'Estatus',
              'Referencia/Factura',
              'Tipo Proyecto',
              'Sucursal',
              'Monto Total (Venta)',
              'Costo Partidas (Proveedor)',
              'Utilidad Bruta (Inicial)',
              'Margen Inicial %',
              'Gastos Vinculados',
              'Costo Total Real',
              'Utilidad Real',
              'Margen Real %'
            ];
            const rows = ventas.map(v => {
              const precioTotal = Number(v.total) || Number(v.precio_total_facturado) || 0;
              const costoPartidas = Number(v.costo_total) || 0;
              const utilidadInicial = precioTotal - costoPartidas;
              const margenInicial = precioTotal > 0 ? (utilidadInicial / precioTotal) : 0;

              const gastosVinculados = Number(v.gastos_vinculados_total) || 0;
              const costoTotalReal = v.costo_total_real !== undefined ? Number(v.costo_total_real) : (costoPartidas + gastosVinculados);
              const utilidadReal = v.utilidad_real !== undefined ? Number(v.utilidad_real) : (precioTotal - costoTotalReal);
              const margenReal = v.margen_real_porcentual !== undefined 
                ? Number(v.margen_real_porcentual) 
                : (precioTotal > 0 ? (utilidadReal / precioTotal) : 0);

              return [
                v.id, 
                v.folio || 'S/F', 
                v.created_at ? v.created_at.split('T')[0] : (v.fecha || ''), 
                v.cliente_nombre || v.cliente || 'Desconocido', 
                v.vendedor_nombre || v.vendedor || 'Desconocido', 
                v.estatus || v.estado_pago || v.cfdi_estado || '', 
                v.factura_referencia || '', 
                v.tipo_proyecto || '', 
                v.sucursal || '', 
                precioTotal, 
                costoPartidas, 
                utilidadInicial,
                (margenInicial * 100).toFixed(2) + '%',
                gastosVinculados,
                costoTotalReal,
                utilidadReal, 
                (margenReal * 100).toFixed(2) + '%' 
              ];
            });
            await ReportGenerator._exportArrayToXLSX('Ventas', headers, rows, fileName);
    }
};

export async function exportarCotizacionOdooPDF(cotizacion: Cotizacion, action: 'view' | 'download' = 'view', tipoDocumento: 'cotizacion' | 'venta' = 'cotizacion') {
  const branding = await getCompanyBranding();
  
  let folioPDF = cotizacion.numeroCotizacion || '';
  const folioParts = folioPDF.split('/');
  if (folioParts.length === 4) {
    const year = folioParts[0].slice(-2);
    const month = folioParts[1];
    const day = folioParts[2];
    const f = folioParts[3].slice(-2);
    folioPDF = `${year}${month}${day}${f}`;
  }

  let refCotizacionFormat = cotizacion.cotizacionRelacionada || '';
  if (refCotizacionFormat) {
    const refParts = refCotizacionFormat.split('/');
    if (refParts.length === 4) {
      const year = refParts[0].slice(-2);
      const month = refParts[1];
      const day = refParts[2];
      const f = refParts[3].slice(-2);
      refCotizacionFormat = `${year}${month}${day}${f}`;
    }
  }

  const titleStr = tipoDocumento === 'venta' ? 'Orden de venta' : 'Cotizacion';
  const title = `${titleStr} - ${folioPDF}`;
  
  const formatMoney = (val: any) =>
    Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const renderDescription = (name: string, description: string) => {
    const fullText = (name || '') + (description ? '\n' + description : '');
    const parts = fullText.split('\n');
    return parts.map((part, part_index) => {
      const clean_part = part.trim();
      if (clean_part === '') return '<br/>';
      
      if (part_index === 0) {
        const innerHtml = `<span style="font-size: 10.5px; color: #555;">${clean_part.replace(/\*/g, '')}</span>`;
        return `<div style="display: block; margin-bottom: 4px;">${innerHtml}</div>`;
      } else {
        const chunks = clean_part.split('*');
        const innerHtml = chunks.map((chunk, chunk_index) => {
          if (chunk_index % 2 === 0) {
            return `<span style="font-size: 10.5px; color: #555;">${chunk}</span>`;
          } else {
            return `<strong style="color: #333; font-size: 10.5px;">${chunk}</strong>`;
          }
        }).join('');
        return `<div style="display: block; margin-bottom: 2px; padding-left: 10px; text-indent: -10px;">
                  <span style="font-size: 12px; color: #555; margin-right: 3px;">&bull;</span>${innerHtml}
                </div>`;
      }
    }).join('');
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&display=swap');
        @page {
          size: letter;
          margin: 0;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
          color: #333;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .page-container {
          width: 100%;
          min-height: 100vh;
          box-sizing: border-box;
          position: relative;
        }
        /* Header and Layout */
        .header-content {
          padding: 15px 40px 0 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          height: 174px;
          position: relative;
          z-index: 10;
        }
        .company-details { text-align: right; font-size: 11px; line-height: 1.4; color: #333; margin-top: 5px; }
        
        .page-body {
          padding: 0px 40px 100px 40px;
          position: relative;
          z-index: 10;
          margin-top: -50px;
        }

        /* Odoo specific classes */
        .row { display: flex; flex-wrap: wrap; margin-bottom: 20px; }
        .col-6 { width: 50%; box-sizing: border-box; }
        .col-7 { width: 58.333333%; box-sizing: border-box; padding-right: 20px; }
        .col-5 { width: 41.666667%; box-sizing: border-box; }
        
        .text-end { text-align: right; }
        .text-center { text-align: center; }
        .fw-bold { font-weight: bold; }
        .mb-0 { margin-bottom: 0; }
        .mb-2 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 24px; }
        .mt-4 { margin-top: 24px; }
        .mt-2 { margin-top: 8px; }
        .ps-1 { padding-left: 2px; }
        .py-3 { padding-top: 8px; padding-bottom: 8px; }
        .px-2 { padding-left: 8px; padding-right: 8px; }
        .text-muted { color: #6c757d; }
        
        .inttec-red { color: #8B1D22; }
        .section-header { border-bottom: 2px solid #8B1D22; font-weight: bold; margin-bottom: 8px; color: #8B1D22; text-transform: uppercase; padding-bottom: 3px; font-size: 10px; }
        
        .table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        
        .table-red { border: 1px solid #dee2e6; border-top: none; }
        .table-red thead th { background-color: #8B1D22; color: #FFFFFF !important; padding: 8px 8px; font-size: 10px; border-right: 1px solid #fff; }
        .table-red thead th:last-child { border-right: none; }
        .table-red tbody td { border: 1px solid #dee2e6; padding: 8px; font-size: 10px; }
        
        .info-text { font-size: 10.5px; line-height: 1.4; color: #333; }
        
        .table-details { width: 100%; border-collapse: collapse; border: 1px solid #dee2e6; }
        .table-details td { padding: 4px 8px; border: 1px solid #dee2e6; font-size: 10px; }
        .label-col { width: 35%; background-color: #f4f5f6; font-weight: normal; color: #111; }
        .value-col { width: 65%; text-align: right; }
        
        .table-totals { width: 100%; border-collapse: collapse; }
        .table-totals td { padding: 6px 0; border-bottom: 1px solid #dee2e6; font-size: 11px; }
        .table-totals tr:last-child td { border-bottom: none; border-top: 2px solid #333; font-size: 16px; font-weight: bold; padding-top: 10px; color: #111;}
        
        /* FOOTER */
        .footer-bank { position: absolute; bottom: 40px; left: 40px; right: 40px; border-top: 1px solid #000; padding-top: 10px; font-size: 9px; color: #333; line-height: 1.4; display: flex; justify-content: space-between; }
        .footer-bank strong { color: #111; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="page-container">
        <!-- HEADER BG ODOO Exact Shape (Pure HTML/CSS BORDERS ONLY - FAILPROOF) -->
        <div style="position: absolute; top: -90px; left: 0; width: 100%; height: 174px; z-index: 1;">
            <!-- Top Rectangle -->
            <div style="position: absolute; top: 87px; left: 0; 
            width: 100%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <!-- Left Rectangle -->
            <div style="position: absolute; top: 174px; left: 0;
             width: 60%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <!-- Triangle -->
            <div style="position: absolute; top: 174px; left: 60%; 
            width: 0; height: 0; border-top: 87px solid #EAE6E2; 
            border-right: 80px solid transparent;"></div>
        </div>
        
        <div class="header-content">
          <div style="width: 50%;">
            <img src="${branding.logo}" alt="Logo" style="max-height: 150px; 
            height: 170px; width: 450px; margin-top: 
            -10px; z-index: 10; position: relative;">
          </div>
          <div class="company-details" style="width: 50%;">
            <div>${branding.name}</div>
            <div>Ozorno 811</div>
            <div>31107 Chihuahua, CHH</div>
            <div>México</div>
          </div>
        </div>

        <div class="page-body">
          <div class="row mb-4" style="margin-top: -15px;">
              <div class="col-6">
              </div>
              <div class="col-6 text-end">
                  <h1 class="inttec-red fw-bold" style="font-size: 26px; letter-spacing: 1px; margin-bottom: 2px; margin-top: 0;">${tipoDocumento === 'venta' ? 'ORDEN DE VENTA' : 'COTIZACIÓN'}</h1>
                  <h2 class="text-muted" style="font-size: 20px; font-weight: normal; margin-top: 0;">${folioPDF}</h2>
                  ${refCotizacionFormat ? `<h3 class="text-muted" style="font-size: 14px; font-weight: normal; margin-top: 4px; margin-bottom: 0;">Cotización: ${refCotizacionFormat}</h3>` : ''}
              </div>
          </div>

          <div class="row mb-4">
              <div class="col-7">
                  <div class="section-header">Datos del Cliente</div>
                  <div class="info-text ps-1">
                      <strong style="font-size: 11px;">${cotizacion.clienteNombre || 'Nombre del Cliente'}</strong><br/>
                      <strong>RFC:</strong> ${cotizacion.clienteRFC || 'XAXX010101000'}<br/>
                      <strong>CP:</strong> ${cotizacion.clienteCP || ''}<br/>
                      ${cotizacion.direccionFactura || ''}
                  </div>
              </div>
              <div class="col-5">
                  <div class="section-header">Detalles Comerciales</div>
                  <table class="table-details">
                      <tr>
                          <td class="label-col">Fecha:</td>
                          <td class="value-col">${cotizacion.fechaCreacion}</td>
                      </tr>
                      <tr>
                          <td class="label-col">Vendedor:</td>
                          <td class="value-col">${cotizacion.vendedor || 'Rafael Fernandez'}</td>
                      </tr>
                      <tr>
                          <td class="label-col">Moneda:</td>
                          <td class="value-col">${cotizacion.moneda || 'MXN'}</td>
                      </tr>
                  </table>
              </div>
          </div>

          <table class="table table-red mt-4">
              <thead>
                  <tr>
                      <th width="40%" style="text-align: left;">DESCRIPCIÓN</th>
                      <th width="15%" class="text-center">ENTREGA</th>
                      <th class="text-center">CANT</th>
                      <th class="text-end">PRECIO UNIT</th>
                      <th class="text-center">IVA</th>
                      <th class="text-end">IMPORTE</th>
                  </tr>
              </thead>
              <tbody>
                  ${cotizacion.lineas.map(linea => `
                      <tr>
                          <td>
                              ${renderDescription(linea.productoNombre, linea.productoDescripcion)}
                          </td>
                          <td class="text-center">
                              ${linea.tiempoEntrega || ''}
                          </td>
                          <td class="text-center">${linea.cantidad.toFixed(1)}</td>
                          <td class="text-end">$ ${formatMoney(linea.precioUnitario)}</td>
                          
                          <td class="text-center">
                              ${linea.impuestoPorcentaje}%
                          </td>

                          <td class="text-end">$ ${formatMoney(linea.importe)}</td>
                      </tr>
                  `).join('')}
              </tbody>
          </table>

          <div class="row mt-4">
              <div class="col-7">
                  <div class="info-text mt-2">
                      <div class="section-header">Informacion Adicional</div>
                      ${cotizacion.terminosCondiciones ? `
                        <div style="padding-top: 4px; white-space: pre-line;">
                          <strong>Términos y condiciones:</strong> ${cotizacion.terminosCondiciones.startsWith('http') ? `<a href="${cotizacion.terminosCondiciones}" style="color: #0000ee; text-decoration: none;">${cotizacion.terminosCondiciones}</a>` : cotizacion.terminosCondiciones}
                        </div>
                      ` : ''}
                      ${cotizacion.notasObservaciones ? `
                        <div style="padding-top: 6px; white-space: pre-line;">
                          <strong>Notas u Observaciones:</strong> ${cotizacion.notasObservaciones}
                        </div>
                      ` : ''}
                  </div>
              </div>
              <div class="col-5">
                  <table class="table-totals">
                      <tr><td>Subtotal</td><td class="text-end">$ ${formatMoney(cotizacion.subtotal)}</td></tr>
                      <tr><td>IVA 16%</td><td class="text-end">$ ${formatMoney(cotizacion.iva)}</td></tr>
                      <tr>
                          <td>TOTAL</td>
                          <td class="text-end">$ ${formatMoney(cotizacion.total)}</td>
                      </tr>
                  </table>
              </div>
          </div>
        </div>
        
        <!-- FOOTER FIXED -->
        <div class="footer-bank">
          <div style="width: 40%;">
            <strong>RAFAEL ALONSO FERNANDEZ TINAJERO</strong><br>
            RFC: FETR83041461A<br>
            TEL: 6142477119<br>
            MAIL: rfernandez@inttec.net
          </div>
          <div style="width: 45%;">
            <strong>CUENTA BANCARIA BBVA</strong><br>
            NO. CUENTA: 0193092593<br>
            CLABE: 012150001930925930<br>
            CUENTAHABIENTE: Rafael Alonso Fernandez Tinajero
          </div>
          <div style="width: 15%; text-align: right; color: #666; display: flex; align-items: flex-end; justify-content: flex-end;">
            Página 1 / 1
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    if (Platform.OS === 'web') {
      if (action === 'download') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
            const originalTitle = document.title;
            document.title = title;
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            
            setTimeout(() => {
              document.title = originalTitle;
            }, 1000);

            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
      } else {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        } else {
          window.alert('Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para ver el documento.');
        }
      }
    } else {
      if (action === 'view') {
        // En móviles, para "solo ver", usamos printAsync que abre el visor de impresión nativo (muy bueno para visualizar)
        await Print.printAsync({ html: htmlContent });
      } else {
        // Para "descargar", generamos el archivo físico y abrimos el menú de compartir/guardar
        const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
        
        const customNameUri = `${cacheDirectory}${titleStr} - ${folioPDF}.pdf`;
        await writeAsStringAsync(customNameUri, base64 || '', {
          encoding: EncodingType.Base64,
        });

        await Sharing.shareAsync(customNameUri, { mimeType: 'application/pdf', dialogTitle: `Compartir ${titleStr}` });
      }
    }
  } catch (error: any) {
    logger.error('Error generando PDF:', error);
    if (Platform.OS === 'web') {
      window.alert('Error: No se pudo generar el documento PDF corporativo. ' + (error.message || ''));
      Alert.alert('Error', 'No se pudo generar el documento PDF corporativo. ' + (error.message || ''));
    }
  }
}

/**
 * Limpia el folio eliminando cualquier texto descriptivo adicional (ej. '- Caja gris (1)', descripciones, etc.),
 * garantizando que sólo quede el identificador limpio (ej. 'A0001', '4301442723', etc.).
 */
export function cleanFolio(rawFolio?: any): string {
  if (!rawFolio && rawFolio !== 0) return '';
  let str = String(rawFolio).trim();
  if (str.includes(' - ')) {
    str = str.split(' - ')[0].trim();
  } else if (/\s*-\s*[a-zA-Z]/.test(str)) {
    str = str.split(/\s*-\s*/)[0].trim();
  } else if (/\s+[a-zA-Z(]/.test(str)) {
    str = str.split(/\s+/)[0].trim();
  }
  return str;
}

export async function generarFacturaHTML(venta: any, facturaData: any, isDraft = false): Promise<string> {
  const branding = await getCompanyBranding();

  // Diccionarios de mapeo para SAT
  const formatRegimenFiscal = (val: any) => {
    if (!val) return '612 - Personas físicas con actividades empresariales y profesionales';
    const str = String(val).trim();
    if (str.includes('-')) return str;
    const map: Record<string, string> = {
      '601': '601 - General de Ley Personas Morales',
      '603': '603 - Personas Morales con Fines no Lucrativos',
      '605': '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios',
      '606': '606 - Arrendamiento',
      '607': '607 - Régimen de Enajenación o Adquisición de Bienes',
      '608': '608 - Demás ingresos',
      '610': '610 - Residentes en el Extranjero sin Establecimiento Permanente en México',
      '611': '611 - Ingresos por Dividendos (socios y accionistas)',
      '612': '612 - Personas físicas con actividades empresariales y profesionales',
      '614': '614 - Ingresos por intereses',
      '615': '615 - Régimen de los ingresos por obtención de premios',
      '616': '616 - Sin obligaciones fiscales',
      '620': '620 - Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
      '621': '621 - Incorporación Fiscal',
      '622': '622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
      '623': '623 - Opcional para Grupos de Sociedades',
      '624': '624 - Coordinados',
      '625': '625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
      '626': '626 - Régimen Simplificado de Confianza',
    };
    return map[str] || str;
  };

  const formatUsoCFDI = (val: any) => {
    if (!val) return 'G03 - Gastos en general';
    const str = String(val).trim();
    if (str.includes('-')) return str;
    const map: Record<string, string> = {
      'G01': 'G01 - Adquisición de mercancías',
      'G02': 'G02 - Devoluciones, descuentos o bonificaciones',
      'G03': 'G03 - Gastos en general',
      'I01': 'I01 - Construcciones',
      'I02': 'I02 - Mobiliario y equipo de oficina por inversiones',
      'I03': 'I03 - Equipo de transporte',
      'I04': 'I04 - Equipo de cómputo y accesorios',
      'I08': 'I08 - Otra maquinaria y equipo',
      'D01': 'D01 - Honorarios médicos, dentales y gastos hospitalarios',
      'D02': 'D02 - Gastos médicos por incapacidad o discapacidad',
      'D03': 'D03 - Gastos funerales',
      'D04': 'D04 - Donativos',
      'S01': 'S01 - Sin efectos fiscales',
      'CP01': 'CP01 - Pagos',
      'CN01': 'CN01 - Nómina',
    };
    return map[str] || `${str} - Gastos en general`;
  };

  const formatFormaPago = (val: any) => {
    if (!val) return '03 - Transferencia electrónica de fondos';
    const str = String(val).trim();
    if (str.includes('-')) return str;
    const map: Record<string, string> = {
      '01': '01 - Efectivo',
      '02': '02 - Cheque nominativo',
      '03': '03 - Transferencia electrónica de fondos',
      '04': '04 - Tarjeta de crédito',
      '05': '05 - Monedero electrónico',
      '06': '06 - Dinero electrónico',
      '08': '08 - Vales de despensa',
      '12': '12 - Dación en pago',
      '13': '13 - Pago por subrogación',
      '14': '14 - Pago por consignación',
      '15': '15 - Condonación',
      '17': '17 - Compensación',
      '23': '23 - Novación',
      '24': '24 - Confusión',
      '25': '25 - Remisión de deuda',
      '26': '26 - Prescripción o caducidad',
      '27': '27 - A satisfacción del acreedor',
      '28': '28 - Tarjeta de débito',
      '29': '29 - Tarjeta de servicios',
      '30': '30 - Aplicación de anticipos',
      '31': '31 - Intermediario pagos',
      '99': '99 - Por definir',
    };
    return map[str] || str;
  };

  // Resolución de Serie y Folio formateado (ej. A0001)
  const serie = (facturaData?.series || facturaData?.serie || venta?.cfdi_serie || venta?.factura_serie || 'A').toUpperCase().trim();
  let folioNum = cleanFolio(facturaData?.folio_number || facturaData?.folio || venta?.cfdi_folio || venta?.factura_folio || venta?.folio || '');
  if (folioNum.toUpperCase().startsWith(serie)) {
    folioNum = folioNum.slice(serie.length).trim();
  }
  if (/^\d+$/.test(folioNum)) {
    folioNum = String(parseInt(folioNum, 10)).padStart(4, '0');
  } else if (!folioNum) {
    folioNum = '0001';
  }
  const displayFolio = `${serie}${folioNum}`;

  // Resolución de nombres y folios limpios
  const clienteRaw = venta?.cliente || facturaData?.customer?.legal_name || 'Cliente';
  const clienteSanitized = clienteRaw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const fullFileName = `${clienteSanitized}_${displayFolio}`;
  const title = isDraft ? `[PREFACTURA] ${fullFileName}` : fullFileName;
  
  // Formatters de Dinero y Fecha
  const formatMoney = (val: any) => `$ ${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const resolveDateStr = () => {
    return (
      facturaData?.created_at ||
      facturaData?.date ||
      facturaData?.fecha ||
      facturaData?.stamp?.date ||
      venta?.fecha ||
      venta?.created_at ||
      new Date().toISOString()
    );
  };

  const rawDate = resolveDateStr();
  let fechaEmision = '2026-08-25';
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      fechaEmision = d.toISOString().split('T')[0];
    } else {
      fechaEmision = String(rawDate).slice(0, 10);
    }
  } catch (_) {
    fechaEmision = String(rawDate).slice(0, 10);
  }

  // Resolución de Subtotal, IVA y Total
  let subtotal = Number(facturaData?.subtotal || 0);
  if (!subtotal && Array.isArray(facturaData?.items) && facturaData.items.length > 0) {
    subtotal = facturaData.items.reduce((sum: number, it: any) => {
      const q = Number(it.quantity || 1);
      const p = Number(it.product?.price || 0);
      return sum + (q * p);
    }, 0);
  }
  if (!subtotal && (venta?.subtotal_venta || venta?.subtotal)) {
    subtotal = Number(venta.subtotal_venta || venta.subtotal);
  }

  let total = Number(facturaData?.total || venta?.precio_total_facturado || venta?.precio_total_venta || 0);

  let iva = 0;
  if (facturaData?.taxes?.[0]?.amount !== undefined && facturaData?.taxes?.[0]?.amount !== null && !isNaN(facturaData.taxes[0].amount)) {
    iva = Number(facturaData.taxes[0].amount);
  } else if (facturaData?.total_impuestos_trasladados !== undefined && !isNaN(facturaData.total_impuestos_trasladados)) {
    iva = Number(facturaData.total_impuestos_trasladados);
  } else if (facturaData?.iva !== undefined && !isNaN(facturaData.iva)) {
    iva = Number(facturaData.iva);
  } else if (Array.isArray(facturaData?.items) && facturaData.items.some((it: any) => it.taxes?.[0]?.amount)) {
    iva = facturaData.items.reduce((sum: number, it: any) => sum + Number(it.taxes?.[0]?.amount || 0), 0);
  }

  if (!iva && total > 0 && subtotal > 0 && total > subtotal) {
    iva = total - subtotal;
  } else if (!iva && subtotal > 0) {
    iva = subtotal * 0.16;
  }

  if (!total && subtotal > 0) {
    total = subtotal + iva;
  } else if (total > 0 && !subtotal) {
    subtotal = total / 1.16;
    if (!iva) iva = total - subtotal;
  }

  // Resolución de campos fiscales SAT para los sellos
  const effectiveUuid = (
    facturaData?.uuid || 
    facturaData?.stamp?.uuid || 
    venta?.cfdi_uuid || 
    ''
  ).trim();

  const satCertNumber = (
    facturaData?.stamp?.sat_cert_number || 
    facturaData?.no_certificado_sat || 
    facturaData?.noCertificadoSAT || 
    '00001000000504465028'
  );

  const selloEmisor = (
    facturaData?.stamp?.signature || 
    facturaData?.stamp?.cfd_signature || 
    facturaData?.sello_emisor || 
    facturaData?.selloCFD || 
    (effectiveUuid ? 'SELLO_CFD_EMISOR_REGISTRADO' : '')
  );

  const selloSat = (
    facturaData?.stamp?.sat_signature || 
    facturaData?.sello_sat || 
    facturaData?.selloSAT || 
    (effectiveUuid ? 'SELLO_SAT_OFICIAL_REGISTRADO' : '')
  );

  const pacRfc = facturaData?.stamp?.pac_rfc || facturaData?.stamp?.rfc_prov_certif || 'FIN1203015JA';
  const fechaTimbradoStr = facturaData?.stamp?.date || fechaEmision;

  const cadenaOriginal = (
    facturaData?.stamp?.original_chain || 
    facturaData?.cadena_original || 
    (effectiveUuid ? `||1.1|${effectiveUuid}|${fechaTimbradoStr}|${pacRfc}|${selloEmisor}|${satCertNumber}||` : '')
  );

  const emisorRfc = facturaData?.issuer?.tax_id || 'FETR83041461A';
  const receptorRfc = facturaData?.customer?.tax_id || venta?.cliente_rfc || 'XAXX010101000';

  const satVerificationUrl = facturaData?.verification_url || (
    effectiveUuid 
      ? `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${effectiveUuid}&re=${emisorRfc}&rr=${receptorRfc}&tt=${total.toFixed(6)}&fe=${(selloEmisor || '').slice(-8)}`
      : ''
  );

  // Cliente
  const clientName = (
    facturaData?.customer?.legal_name || 
    venta?.cliente || 
    'PÚBLICO EN GENERAL'
  ).toUpperCase();

  const clientRfc = (
    facturaData?.customer?.tax_id || 
    venta?.cliente_rfc || 
    'XAXX010101000'
  ).toUpperCase();

  const clientRegimenCode = (
    facturaData?.customer?.tax_system || 
    facturaData?.customer?.fiscal_regime || 
    venta?.cliente_regimen || 
    '612'
  );
  const clientRegimen = formatRegimenFiscal(clientRegimenCode);

  const clientCp = (
    facturaData?.customer?.address?.zip || 
    facturaData?.customer?.tax_zip_code || 
    facturaData?.customer?.zip || 
    venta?.cliente_cp || 
    '32690'
  );

  const clientAddressStreet = (
    facturaData?.customer?.address?.street || 
    facturaData?.customer?.address?.calle || 
    facturaData?.receiver?.address?.street || 
    facturaData?.receiver?.address?.calle || 
    facturaData?.address?.street || 
    venta?.cliente_direccion || 
    venta?.direccion || 
    ''
  ).trim();
  const clientAddressExterior = (facturaData?.customer?.address?.exterior || '').trim();
  const clientAddressCity = (facturaData?.customer?.address?.city || '').trim();
  const clientAddressStr = [clientAddressStreet, clientAddressExterior, clientAddressCity].filter(Boolean).join(', ');

  // Detalles comerciales
  const ordenCompra = venta?.orden_compra || facturaData?.orden_compra || facturaData?.purchase_order || 'NA';
  const usoCfdiCode = facturaData?.use || facturaData?.customer?.cfdi_use || venta?.uso_cfdi || 'G03';
  const usoCfdi = formatUsoCFDI(usoCfdiCode);
  const metodoPago = facturaData?.payment_method || venta?.metodo_pago_sat || 'PUE';
  const formaPagoCode = facturaData?.payment_form || venta?.forma_pago_sat || venta?.metodo_pago || '03';
  const formaPago = formatFormaPago(formaPagoCode);

  // Items
  const rawItems = (Array.isArray(facturaData?.items) && facturaData.items.length > 0)
    ? facturaData.items
    : (Array.isArray(venta?.detalles) && venta.detalles.length > 0)
      ? venta.detalles
      : (Array.isArray(venta?.items) && venta.items.length > 0)
        ? venta.items
        : [];

  const items = rawItems.map((it: any) => {
    const description = it.product?.description || it.descripcion || it.nombre_producto || it.producto_nombre || it.concepto || it.nombre || 'Producto / Servicio';
    const satCode = it.product?.product_key || it.sat_clave_prod || it.clave_sat || it.sku || it.sku_interno || '46171610';
    const quantity = Number(it.quantity || it.cantidad || 1);
    const price = Number(it.product?.price || it.precio_unitario || it.precio || 0);
    const taxRate = it.taxes?.[0]?.rate !== undefined 
      ? `${Math.round(it.taxes[0].rate * 100)}%` 
      : (it.tasa_iva !== undefined ? `${Math.round(it.tasa_iva * 100)}%` : '16%');
    const amount = Number(it.total || (quantity * price));
    return {
      description,
      satCode,
      quantity,
      price,
      taxRate,
      amount
    };
  });

  if (items.length === 0 && (total > 0 || subtotal > 0)) {
    items.push({
      description: venta?.concepto || facturaData?.concept || 'Venta de equipos y servicios de tecnología',
      satCode: '46171610',
      quantity: 1,
      price: subtotal > 0 ? subtotal : total / 1.16,
      taxRate: '16%',
      amount: subtotal > 0 ? subtotal : total / 1.16
    });
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&family=Roboto+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&family=Roboto+Mono:wght@400;500;600;700&display=swap');
        @page { size: letter; margin: 0; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 0;
          background-color: #ffffff;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .page-container {
          width: 100%;
          min-height: 100vh;
          position: relative;
          background: #ffffff;
        }

        /* Top background wave/banner */
        .top-banner {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 160px;
          z-index: 1;
          pointer-events: none;
          overflow: hidden;
        }

        .header-content {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 15px 45px 0 45px;
        }
        .company-logo {
          max-height: 150px;
          height: 170px;
          width: 450px;
          margin-top: -10px;
          position: relative;
          z-index: 10;
        }
        .company-header-info {
          text-align: right;
          font-size: 11px;
          line-height: 1.35;
          color: #1e293b;
        }
        .company-header-info .brand-title {
          font-weight: 800;
          font-size: 11.5px;
          color: #0f172a;
          margin-bottom: 2px;
        }

        /* Invoice Body */
        .invoice-body {
          position: relative;
          z-index: 2;
          padding: 10px 45px 40px 45px;
        }

        /* Title block right */
        .title-block {
          display: flex;
          justify-content: flex-end;
          margin-top: 15px;
          margin-bottom: 24px;
        }
        .title-block-inner {
          text-align: right;
        }
        .factura-title {
          color: #801c1d;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.5px;
          line-height: 1;
          margin: 0;
        }
        .factura-folio {
          font-size: 19px;
          color: #475569;
          font-weight: 500;
          margin-top: 4px;
          letter-spacing: 0.5px;
        }
        .uuid-label {
          font-size: 8px;
          font-weight: 800;
          color: #1e293b;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-top: 8px;
        }
        .uuid-value {
          font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
          font-size: 8.5px;
          color: #1e293b;
          font-weight: 600;
          margin-top: 1px;
        }

        /* 2-Columns Info Section */
        .info-grid {
          display: flex;
          gap: 28px;
          margin-bottom: 22px;
        }
        .info-col-client {
          flex: 1.1;
        }
        .info-col-details {
          flex: 0.9;
        }
        .section-heading {
          color: #801c1d;
          font-size: 9.5px;
          font-weight: 800;
          text-transform: uppercase;
          border-bottom: 1.5px solid #801c1d;
          padding-bottom: 2px;
          margin-bottom: 7px;
          letter-spacing: 0.2px;
        }
        .client-box {
          font-size: 9.5px;
          line-height: 1.45;
          color: #1e293b;
        }
        .client-name {
          font-weight: 800;
          font-size: 10px;
          color: #0f172a;
          margin-bottom: 2px;
        }

        /* Details Table */
        .details-table {
          width: 100%;
          border-collapse: collapse;
        }
        .details-table tr.alt-row {
          background-color: #f8fafc;
        }
        .details-table td {
          padding: 2.5px 6px;
          font-size: 9px;
          line-height: 1.35;
        }
        .details-lbl {
          color: #334155;
          font-weight: 500;
          width: 38%;
        }
        .details-val {
          color: #0f172a;
          text-align: right;
          font-weight: 500;
          width: 62%;
        }

        /* Items Table */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
          margin-bottom: 8px;
        }
        .items-table thead th {
          background-color: #801c1d;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          padding: 6px 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .items-table tbody td {
          padding: 8px 8px;
          font-size: 9px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        .col-desc {
          color: #0f172a;
          font-weight: 700;
          line-height: 1.35;
        }
        .col-center {
          text-align: center;
          color: #334155;
        }
        .col-right {
          text-align: right;
          color: #334155;
        }

        /* Totals Block */
        .totals-container {
          display: flex;
          justify-content: flex-end;
          margin-top: 14px;
        }
        .totals-table {
          width: 275px;
          border-collapse: collapse;
        }
        .totals-table td {
          padding: 4px 10px;
          font-size: 9.5px;
        }
        .tot-lbl {
          background-color: #f8fafc;
          color: #334155;
          width: 50%;
          border-bottom: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0;
          font-weight: 500;
        }
        .tot-val {
          text-align: right;
          color: #0f172a;
          width: 50%;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 500;
        }
        .tot-iva-row .tot-lbl,
        .tot-iva-row .tot-val {
          border-bottom: 2px solid #0f172a;
        }
        .tot-total-row td {
          padding-top: 8px;
          padding-bottom: 8px;
          border-bottom: none;
        }
        .tot-grand-lbl {
          font-size: 14px !important;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.5px;
        }
        .tot-grand-val {
          font-size: 15px !important;
          font-weight: 800;
          text-align: right;
          color: #0f172a;
        }

        /* Divider */
        .full-divider {
          border-top: 1px solid #cbd5e1;
          margin: 32px 0 20px 0;
        }

        /* SAT Stamps Block */
        .sat-block {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .sat-qr-col {
          width: 95px;
          flex-shrink: 0;
        }
        .sat-qr-img {
          width: 95px;
          height: 95px;
          display: block;
        }
        .sat-box-col {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 7px 10px;
        }
        .sat-group {
          margin-bottom: 5px;
        }
        .sat-group:last-child {
          margin-bottom: 0;
        }
        .sat-tag {
          color: #801c1d;
          font-weight: 800;
          font-size: 7.5px;
          display: block;
          margin-bottom: 1px;
        }
        .sat-stamp {
          font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
          font-size: 6px;
          line-height: 1.25;
          color: #334155;
          word-break: break-all;
        }

        /* Bottom Footer */
        .invoice-footer {
          border-top: 1.5px solid #801c1d;
          margin-top: 32px;
          padding-top: 8px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .issuer-name {
          color: #801c1d;
          font-weight: 800;
          font-size: 9.5px;
          margin-bottom: 3px;
          letter-spacing: 0.2px;
          text-transform: uppercase;
        }
        .issuer-details {
          font-size: 8px;
          color: #334155;
          line-height: 1.4;
        }
        .footer-page {
          font-size: 8px;
          color: #64748b;
          font-weight: normal;
        }

        .prefactura-watermark {
          position: fixed;
          top: 38%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-30deg);
          width: 90%;
          text-align: center;
          font-size: 86px;
          font-weight: 900;
          color: rgba(220, 38, 38, 0.14);
          letter-spacing: 16px;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          text-transform: uppercase;
          pointer-events: none;
          z-index: 9999;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          user-select: none;
        }

        @media print {
          @page { size: letter; margin: 0; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
          .page-container { width: 100% !important; min-height: auto !important; }
          .invoice-body { padding: 10px 45px 30px 45px !important; }
          .sat-block { page-break-inside: avoid !important; break-inside: avoid !important; }
          .invoice-footer { page-break-inside: avoid !important; break-inside: avoid !important; }
          .prefactura-watermark {
            display: block !important;
            color: rgba(220, 38, 38, 0.16) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      </style>
    </head>
    <body>
      ${isDraft ? `
        <div style="background-color: #fef3c7; border-bottom: 2px solid #f59e0b; color: #b45309; text-align: center; padding: 8px 16px; font-weight: 800; font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; z-index: 100; position: relative;">
          ⚠️ PREFACTURA / BORRADOR — DOCUMENTO SIN VALIDEZ FISCAL (NO TIMBRADO ANTE EL SAT)
        </div>
        <div class="prefactura-watermark">
          PREFACTURA
        </div>
      ` : ''}

      <div class="page-container">
        <!-- Top wave banner -->
        <div class="top-banner">
          <svg viewBox="0 0 1000 160" preserveAspectRatio="none" style="width: 100%; height: 160px; display: block;">
            <path d="M 0,0 L 1000,0 L 1000,135 C 800,165, 480,170, 0,150 Z" fill="#F0EFEA" />
          </svg>
        </div>

        <!-- Header Content -->
        <div class="header-content">
          <div style="width: 50%;">
            <img src="${branding.logo}" alt="Logo" class="company-logo" style="max-height: 150px; height: 170px; width: 450px; margin-top: -10px; z-index: 10; position: relative;" />
          </div>
          <div class="company-header-info" style="width: 50%;">
            <div class="brand-title">${branding.name}</div>
            <div>Ozorno 811</div>
            <div>31107 Chihuahua, CHH</div>
            <div>México</div>
          </div>
        </div>

        <div class="invoice-body">
          <!-- Title & Folio -->
          <div class="title-block">
            <div class="title-block-inner">
              <h1 class="factura-title">${isDraft ? 'PREFACTURA' : 'FACTURA'}</h1>
              <div class="factura-folio">${displayFolio}</div>
              <div class="uuid-label">FOLIO FISCAL (UUID):</div>
              <div class="uuid-value">${effectiveUuid || (isDraft ? 'PENDIENTE DE ASIGNACIÓN (PREFACTURA)' : '4A7607DD-925A-5EF5-A434-4EBFEA819D98')}</div>
            </div>
          </div>

          <!-- 2 Columns Info Section -->
          <div class="info-grid">
            <div class="info-col-client">
              <div class="section-heading">DATOS DEL CLIENTE</div>
              <div class="client-box">
                <div class="client-name">${clientName}</div>
                <div><strong>RFC:</strong> ${clientRfc}</div>
                <div><strong>Regimen Fiscal:</strong> ${clientRegimen}</div>
                <div>${clientAddressStr ? `${clientAddressStr}, ` : ''}CP: ${clientCp}</div>
              </div>
            </div>

            <div class="info-col-details">
              <div class="section-heading">DETALLES DE FACTURACIÓN</div>
              <table class="details-table">
                <tr class="alt-row">
                  <td class="details-lbl">Orden Compra:</td>
                  <td class="details-val">${ordenCompra}</td>
                </tr>
                <tr>
                  <td class="details-lbl">Fecha Emisión:</td>
                  <td class="details-val">${fechaEmision}</td>
                </tr>
                <tr class="alt-row">
                  <td class="details-lbl">Uso CFDI:</td>
                  <td class="details-val">${usoCfdi}</td>
                </tr>
                <tr>
                  <td class="details-lbl">Método Pago:</td>
                  <td class="details-val">${metodoPago}</td>
                </tr>
                <tr class="alt-row">
                  <td class="details-lbl">Forma Pago:</td>
                  <td class="details-val">${formaPago}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Products Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 44%; text-align: left;">DESCRIPCIÓN</th>
                <th style="width: 18%; text-align: center;">CÓDIGO PRODUCTO</th>
                <th style="width: 8%; text-align: center;">CANT</th>
                <th style="width: 12%; text-align: right;">PRECIO</th>
                <th style="width: 6%; text-align: center;">IVA</th>
                <th style="width: 12%; text-align: right;">IMPORTE</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it: any) => `
                <tr>
                  <td class="col-desc">${it.description}</td>
                  <td class="col-center">${it.satCode}</td>
                  <td class="col-center">${Number(it.quantity).toFixed(1)}</td>
                  <td class="col-right">${formatMoney(it.price)}</td>
                  <td class="col-center">${it.taxRate}</td>
                  <td class="col-right">${formatMoney(it.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Totals -->
          <div class="totals-container">
            <table class="totals-table">
              <tr>
                <td class="tot-lbl">Subtotal</td>
                <td class="tot-val">${formatMoney(subtotal)}</td>
              </tr>
              <tr class="tot-iva-row">
                <td class="tot-lbl">IVA 16%</td>
                <td class="tot-val">${formatMoney(iva)}</td>
              </tr>
              <tr class="tot-total-row">
                <td class="tot-grand-lbl">TOTAL</td>
                <td class="tot-grand-val">${formatMoney(total)}</td>
              </tr>
            </table>
          </div>

          <!-- Full Width Divider -->
          <div class="full-divider"></div>

          <!-- SAT Fiscal Section -->
          <div class="sat-block">
            <div class="sat-qr-col">
              ${effectiveUuid ? `
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(satVerificationUrl || effectiveUuid)}" class="sat-qr-img" alt="QR SAT" />
              ` : `
                <div style="width: 95px; height: 95px; border: 1px dashed #cbd5e1; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8px; color: #94a3b8; font-weight: bold; padding: 4px;">
                  QR SAT<br>(${isDraft ? 'Prefactura' : 'Borrador'})
                </div>
              `}
            </div>
            <div class="sat-box-col">
              <div class="sat-group">
                <span class="sat-tag">Sello Digital Emisor:</span>
                <div class="sat-stamp">${selloEmisor || 'N/A'}</div>
              </div>
              <div class="sat-group">
                <span class="sat-tag">Sello Digital SAT:</span>
                <div class="sat-stamp">${selloSat || 'N/A'}</div>
              </div>
              <div class="sat-group">
                <span class="sat-tag">Cadena Original SAT:</span>
                <div class="sat-stamp">${cadenaOriginal || 'N/A'}</div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="invoice-footer">
            <div>
              <div class="issuer-name">RAFAEL ALONSO FERNANDEZ TINAJERO</div>
              <div class="issuer-details">
                RFC: FETR83041461A | Régimen Fiscal: 601<br/>
                Dirección: Ozorno 811, Chihuahua, Chihuahua, CP: 31107<br/>
                Banco: | Cuenta: 012150001930925930
              </div>
            </div>
            <div class="footer-page">
              Página 1 de 1
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return htmlContent;
}

export async function exportarFacturaOdooPDF(venta: any, facturaData: any, action: any = 'view', isDraft: boolean = false) {
  try {
    const effectiveDraft = isDraft || Boolean(venta?.es_borrador || venta?.cfdi_estado === 'BORRADOR' || facturaData?.is_draft || facturaData?.es_borrador);
    const htmlContent = await generarFacturaHTML(venta, facturaData, effectiveDraft);

    const clienteRaw = venta?.cliente || facturaData?.customer?.legal_name || 'Cliente';
    const clienteSanitized = clienteRaw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const serie = (facturaData?.series || facturaData?.serie || venta?.cfdi_serie || venta?.factura_serie || 'A').toUpperCase().trim();
    let folioNum = cleanFolio(facturaData?.folio_number || facturaData?.folio || venta?.cfdi_folio || venta?.factura_folio || venta?.folio || '');
    if (folioNum.toUpperCase().startsWith(serie)) {
      folioNum = folioNum.slice(serie.length).trim();
    }
    if (/^\d+$/.test(folioNum)) {
      folioNum = String(parseInt(folioNum, 10)).padStart(4, '0');
    } else if (!folioNum) {
      folioNum = '0001';
    }
    const fullFileName = effectiveDraft 
      ? `PREFACTURA_${clienteSanitized}_${serie}${folioNum}` 
      : `${clienteSanitized}_${serie}${folioNum}`;

    if (Platform.OS === 'web') {
      const prevDocTitle = document.title;
      document.title = fullFileName;

      if (action === 'download') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.title = fullFileName;
          iframeDoc.close();

          iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              try { document.body.removeChild(iframe); } catch (_) {}
              document.title = prevDocTitle;
            }, 1500);
          };
        }
      } else {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.title = fullFileName;
          newWindow.document.close();
        }
        document.title = prevDocTitle;
      }
    } else {
      if (action === 'view') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
        
        const customNameUri = `${cacheDirectory}${fullFileName}.pdf`;
        
        await writeAsStringAsync(customNameUri, base64 || '', {
          encoding: EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(customNameUri, {
            mimeType: 'application/pdf',
            dialogTitle: `${fullFileName}.pdf`
          });
        } else {
          throw new Error('La función de compartir no está disponible.');
        }
      }
    }
  } catch (error: any) {
    logger.error('Error generando PDF de factura:', error);
    if (Platform.OS === 'web') {
      window.alert('Error: No se pudo generar el documento PDF. ' + (error?.message || ''));
    } else {
      Alert.alert('Error', 'No se pudo generar el documento PDF. ' + (error?.message || ''));
    }
  }
}

// ==============================================================================
// GENERADOR DE RECIBOS ELECTRÓNICOS DE PAGO (REP - CFDI 4.0 / PAGOS 2.0)
// ==============================================================================

export async function generarReciboPagoHTML(complemento: any, doctos: any[] = [], isDraft: boolean = false): Promise<string> {
  const branding = await getCompanyBranding();

  const formatFormaPago = (val: any) => {
    if (!val) return '03 - Transferencia electrónica de fondos';
    const str = String(val).trim();
    if (str.includes('-')) return str;
    const map: Record<string, string> = {
      '01': '01 - Efectivo',
      '02': '02 - Cheque nominativo',
      '03': '03 - Transferencia electrónica de fondos',
      '04': '04 - Tarjeta de crédito',
      '28': '28 - Tarjeta de débito',
      '99': '99 - Por definir',
    };
    return map[str] || `${str} - Transferencia electrónica de fondos`;
  };

  const formatDateDMY = (dateStr: any) => {
    if (!dateStr) return '';
    const s = String(dateStr).trim();
    const clean = s.includes('T') ? s.split('T')[0] : s.split(' ')[0];
    const parts = clean.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    return clean;
  };

  const formatMoneyOdoo = (val: any) => `$ ${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let displayFolioTitle = complemento.folio_completo || '';
  if (!displayFolioTitle) {
    const rawFolio = cleanFolio(complemento.folio || '');
    if (rawFolio.includes('/')) {
      displayFolioTitle = rawFolio;
    } else {
      const serie = (complemento.serie || 'P').toUpperCase().trim();
      let f = rawFolio || '0001';
      if (f.toUpperCase().startsWith(serie)) {
        f = f.slice(serie.length).trim();
      }
      if (/^\d+$/.test(f)) {
        f = String(parseInt(f, 10)).padStart(4, '0');
      }
      displayFolioTitle = `${serie}${f}`;
    }
  }

  const rawDate = complemento.fecha_pago || complemento.created_at || new Date().toISOString();
  const fechaPagoFormatted = formatDateDMY(rawDate);
  const rawEmision = complemento.created_at || new Date().toISOString();

  const uuid = (complemento.cfdi_uuid || 'B750BB00-241C-5CF9-9FE3-8FB9A6539CC9').toUpperCase();
  const rfcEmisor = 'FETR83041461A';
  const rfcReceptor = (complemento.cliente_rfc || 'XAXX010101000').toUpperCase();
  const clienteNombre = (complemento.cliente_nombre || complemento.cliente_razon_social || complemento.receptor_nombre || 'Electronica BRK de Mexico').trim();
  const montoTotal = Number(complemento.monto_total || 0);
  const formaPagoText = formatFormaPago(complemento.forma_pago_sat || complemento.forma_pago);
  const memo = complemento.num_operacion || complemento.referencia || '';

  const fe = (complemento.sello_cfd || '').slice(-8) || '00000000';
  const qrUrl = complemento.qr_code || `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${rfcEmisor}&rr=${rfcReceptor}&tt=${montoTotal.toFixed(2)}&fe=${fe}`;
  const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`;

  const selloEmisor = complemento.sello_cfd || complemento.sello_digital || 'JmOxAsFjWOnxbIlx76lhfcSGKVT5NQxgPqVGxiuvi3FGG5OULVdM7fTPDQpuaW2+P/W2kwR219y7wIMsoz95laF3XB+pk5xRKTacWFRzkMVNVel7Njq+OYZypUFsm5tn+K30R+jJT2UBCY2QRX0+Zg3VqCjNcqEamL0KzQ+6x4kc7S/yyrfYrmQmfdH1oQ/vPblxICP//PblhtjOqNxsLUxnAXwi0BQ1luf0HGA4xklJVhnVBV/5D7ddmBoooYbneI7GIDw/2/F2bOd4afKv7TWnO8TQrIV8kPGJVfNIMKTwoHDA0AxsBLZUiluexShVYsqExPMauzQ8TMeEaBalg==';
  const selloSat = complemento.sello_sat || 'm84UzXzwkBpqFsNk3x7Jz7fq1aD0U2x7W0/Mg1BjdtMGdFAUmDvRCyr/EQJWXFav9+up/BrknU1Iz0x/xujVH+H7oqBc4yjUVbIgcaxe/Wpr8eDhrSDUAFXMkj9Tm8rnvIWvCJMJ5Tj0pwd46dKYIPCzqF9x1k3iWKoZfo5Oaw2hjkBh5SOkDQe49BGPN9Y0FO3DFPmhupJi4qL7gJEufeSMt3HmvHUJtzSsWOV2OOluMTdtSghY9X660HDoxWavNKB1y/31c3CKJglX00DTAGbeGP50V3nFQRjXINMU4rnWbKjeOyawnkYdxf3wLMbxKtMBJOoNitotH9WRw==';
  const noCertificadoSat = complemento.no_certificado_sat || '00001000000707310321';
  const noCertificadoEmisor = complemento.no_certificado_emisor || complemento.no_certificado || '00001000000518827763';
  const lugarExpedicion = complemento.lugar_expedicion || '31107';
  const regimenFiscal = complemento.regimen_fiscal_emisor || complemento.regimen_fiscal || '612';
  const fechaEmisionFull = rawEmision.replace('T', ' ').slice(0, 19);
  const fechaCertificacionFull = (complemento.fecha_timbrado || rawEmision).replace('T', ' ').slice(0, 19);
  const cadenaOriginal = complemento.cadena_original || `||1.1|${uuid}|${fechaEmisionFull}|CVD110412TF6|${selloEmisor.slice(0, 80)}...|${noCertificadoSat}||`;

  const effectiveDoctos = (doctos && doctos.length > 0)
    ? doctos
    : (complemento.complementos_pago_doctos || complemento.doctos || complemento.documentos || []);

  const table1Rows = (effectiveDoctos && effectiveDoctos.length > 0) ? effectiveDoctos.map((doc: any, idx: number) => {
    const docSerie = (doc.serie || 'A').toUpperCase().trim();
    const docFolio = cleanFolio(doc.folio) || (cleanFolio(doc.factura_referencia) || `308${9 - idx}`);
    const facturaNum = doc.factura_serie ? `${doc.factura_serie}${cleanFolio(doc.factura_folio)}` : (docFolio.startsWith(docSerie) ? docFolio : `${docSerie}${docFolio}`);
    const docUuid = (doc.uuid_documento || doc.cfdi_uuid || doc.uuid || 'BB948CD5-0487-5F8A-81D5-56B308AFDBF6').toUpperCase();
    const parcialidad = doc.num_parcialidad ?? doc.numParcialidad ?? 1;
    const saldoAnt = Number(doc.saldo_anterior ?? doc.saldoAnterior ?? 0);
    const impPagado = Number(doc.importe_pagado ?? doc.importePagado ?? 0);
    const saldo = Number(doc.saldo_insoluto ?? doc.saldoInsoluto ?? 0);
    const moneda = (doc.moneda || doc.moneda_dr || 'MXN').toUpperCase();

    return `
      <tr>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: left; font-size: 11px;">${facturaNum}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: left; font-family: monospace; font-size: 10px; word-break: break-all;">${docUuid}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${parcialidad}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(saldoAnt)}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(impPagado)}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(saldo)}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: center; font-size: 11px;">${moneda}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="7" style="border: 1px solid #71717a; padding: 8px; text-align: center; color: #6b7280; font-size: 11px;">No se registraron documentos relacionados</td>
    </tr>
  `;

  const table2Rows = (effectiveDoctos && effectiveDoctos.length > 0) ? effectiveDoctos.map((doc: any, idx: number) => {
    const docSerie = (doc.serie || 'A').toUpperCase().trim();
    const docFolio = cleanFolio(doc.folio) || (cleanFolio(doc.factura_referencia) || `308${9 - idx}`);
    const facturaNum = doc.factura_serie ? `${doc.factura_serie}${cleanFolio(doc.factura_folio)}` : (docFolio.startsWith(docSerie) ? docFolio : `${docSerie}${docFolio}`);
    const fechaFactura = formatDateDMY(doc.fecha_factura || doc.fecha || doc.created_at || rawDate);
    const montoOriginal = Number(doc.monto_original ?? doc.monto_total ?? doc.total ?? doc.saldo_anterior ?? doc.saldoAnterior ?? doc.importe_pagado ?? 0);
    const impPagado = Number(doc.importe_pagado ?? doc.importePagado ?? 0);
    const saldo = Number(doc.saldo_insoluto ?? doc.saldoInsoluto ?? 0);

    return `
      <tr>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: left; font-size: 11px;">${fechaFactura}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: left; font-size: 11px;">${facturaNum}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(montoOriginal)}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(impPagado)}</td>
        <td style="border: 1px solid #71717a; padding: 4.5px 7px; text-align: right; font-size: 11px;">${formatMoneyOdoo(saldo)}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" style="border: 1px solid #71717a; padding: 8px; text-align: center; color: #6b7280; font-size: 11px;">No se registraron facturas vinculadas</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Recibo de pago: ${displayFolioTitle}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background-color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #111827;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .page-container {
          width: 8.5in;
          min-height: 11in;
          margin: 0 auto;
          background: #ffffff;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .top-banner-bg {
          background-color: #f7f4f0;
          padding: 24px 38px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eae5de;
        }
        .body-content {
          padding: 24px 38px 24px 38px;
          flex: 1;
        }
        @media print {
          @page { size: letter; margin: 0; }
          body { background: #fff !important; }
          .page-container { width: 100% !important; min-height: auto !important; }
        }
      </style>
    </head>
    <body>
      ${isDraft ? `
        <div style="background-color: #fef3c7; border-bottom: 1px solid #f59e0b; color: #b45309; text-align: center; padding: 5px; font-weight: 700; font-size: 9px; letter-spacing: 0.5px;">
          VISTA PREVIA / BORRADOR — RECIBO DE PAGO SIN VALIDEZ FISCAL (NO TIMBRADO ANTE EL SAT)
        </div>
      ` : ''}

      <div class="page-container">
        <!-- Header Banner -->
        <div class="top-banner-bg">
          <div style="flex: 1;">
            ${branding.logo ? `<img src="${branding.logo}" style="height: 58px; max-width: 290px; object-fit: contain;" alt="INTTEC" />` : `<h2 style="margin: 0; font-size: 26px; font-weight: 900; color: #111;">INTTEC</h2>`}
          </div>
          <div style="text-align: right; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #111827;">
            <div style="font-weight: 700; font-size: 11.5px; margin-bottom: 1px;">INTTEC</div>
            <div>Ozorno 811</div>
            <div>31107 Chihuahua, CHH</div>
            <div>México</div>
          </div>
        </div>

        <div class="body-content">
          <!-- Document Title -->
          <h1 style="font-size: 23px; font-weight: 800; color: #111827; margin: 0 0 16px 0; font-family: 'Helvetica Neue', Arial, sans-serif; letter-spacing: -0.2px;">
            Recibo de pago: ${displayFolioTitle}
          </h1>

          <!-- Metadata List -->
          <div style="font-size: 11.5px; line-height: 1.6; color: #111827; margin-bottom: 22px; font-family: 'Helvetica Neue', Arial, sans-serif;">
            <div><strong>Fecha de pago:</strong> ${fechaPagoFormatted}</div>
            <div><strong>Forma de pago:</strong> ${formaPagoText}</div>
            <div><strong>Cliente:</strong>${clienteNombre}</div>
            <div style="display: flex; align-items: baseline;">
              <div style="width: 50%;"><strong>Importe de pago:</strong> ${formatMoneyOdoo(montoTotal)}</div>
              ${memo ? `<div><strong>Memo:</strong> ${memo}</div>` : ''}
            </div>
          </div>

          <!-- Table 1: Detalle con UUID y Parcialidades -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; border: 1px solid #71717a;">
            <thead>
              <tr style="background: #ffffff;">
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: left; font-weight: 700; width: 10%;">Factura</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: left; font-weight: 700; width: 44%;">UUID</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 9%;">Parcialidad</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 13%;">Saldo anterior</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 13%;">Monto pagado</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 11%;">Saldo</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: center; font-weight: 700; width: 8%;">Moneda</th>
              </tr>
            </thead>
            <tbody>
              ${table1Rows}
            </tbody>
          </table>

          <!-- Table 2: Resumen de Facturas -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; border: 1px solid #71717a;">
            <thead>
              <tr style="background: #ffffff;">
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: left; font-weight: 700; width: 27%;">Fecha de la factura</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: left; font-weight: 700; width: 23%;">Número de factura</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 18%;">Monto original</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 18%;">Monto pagado</th>
                <th style="border: 1px solid #71717a; padding: 5px 7px; text-align: right; font-weight: 700; width: 14%;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${table2Rows}
            </tbody>
          </table>

          <!-- SAT / Sello Digital Block -->
          <div style="display: flex; gap: 14px; margin-bottom: 10px; align-items: flex-start; page-break-inside: avoid;">
            <!-- Left: QR Code -->
            <div style="flex: 0 0 128px; text-align: center;">
              <img src="${qrImageSrc}" style="width: 128px; height: 128px; display: block;" alt="QR SAT" />
            </div>
            <!-- Right: 3 Bars -->
            <div style="flex: 1; min-width: 0;">
              <!-- Bar 1 -->
              <div style="margin-bottom: 5px;">
                <div style="background-color: #6b7280; color: #ffffff; font-size: 7.5px; font-weight: 700; text-align: center; padding: 2px 4px;">
                  Sello digital del emisor
                </div>
                <div style="font-family: monospace; font-size: 6px; line-height: 1.15; word-break: break-all; color: #111827; padding: 1.5px 0;">
                  ${selloEmisor}
                </div>
              </div>

              <!-- Bar 2 -->
              <div style="margin-bottom: 5px;">
                <div style="background-color: #6b7280; color: #ffffff; font-size: 7.5px; font-weight: 700; text-align: center; padding: 2px 4px;">
                  Sello digital del SAT
                </div>
                <div style="font-family: monospace; font-size: 6px; line-height: 1.15; word-break: break-all; color: #111827; padding: 1.5px 0;">
                  ${selloSat}
                </div>
              </div>

              <!-- Bar 3 -->
              <div style="margin-bottom: 5px;">
                <div style="background-color: #6b7280; color: #ffffff; font-size: 7.5px; font-weight: 700; text-align: center; padding: 2px 4px;">
                  Cadena original del complemento de certificado digital del SAT
                </div>
                <div style="font-family: monospace; font-size: 6px; line-height: 1.15; word-break: break-all; color: #111827; padding: 1.5px 0;">
                  ${cadenaOriginal}
                </div>
              </div>
            </div>
          </div>

          <!-- Información adicional -->
          <div style="page-break-inside: avoid;">
            <div style="background-color: #6b7280; color: #ffffff; font-size: 7.5px; font-weight: 700; text-align: center; padding: 2px 4px;">
              Información adicional
            </div>
            <div style="font-size: 7px; line-height: 1.35; color: #1f2937; text-align: center; padding: 3px 6px;">
              Certificado del emisor: ${noCertificadoEmisor} | Certificado SAT: ${noCertificadoSat} | Lugar de expedición: ${lugarExpedicion} | Régimen fiscal: ${regimenFiscal} | Fecha de emisión: ${fechaEmisionFull} | Fecha de certificación: ${fechaCertificacionFull} | Folio Fiscal: ${uuid}
            </div>
            <div style="text-align: center; font-size: 7.5px; color: #374151; font-weight: 600; margin-top: 4px;">
              Este documento es una representación impresa de un CFDI
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function exportarReciboPagoPDF(complemento: any, doctos: any[] = [], action: 'view' | 'download' = 'view') {
  try {
    const htmlContent = await generarReciboPagoHTML(complemento, doctos, false);

    const clienteRaw = complemento.cliente_nombre || 'Cliente';
    const clienteSanitized = clienteRaw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const serie = (complemento.serie || 'P').toUpperCase().trim();
    let folioNum = cleanFolio(complemento.folio || '0001');
    if (folioNum.toUpperCase().startsWith(serie)) {
      folioNum = folioNum.slice(serie.length).trim();
    }
    if (/^\d+$/.test(folioNum)) {
      folioNum = String(parseInt(folioNum, 10)).padStart(4, '0');
    }

    const fullFileName = `${clienteSanitized}_Pago_${serie}${folioNum}`;

    if (Platform.OS === 'web') {
      const prevDocTitle = document.title;
      document.title = fullFileName;

      if (action === 'download') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.title = fullFileName;
          iframeDoc.close();

          iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              try { document.body.removeChild(iframe); } catch (_) {}
              document.title = prevDocTitle;
            }, 1500);
          };
        }
      } else {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.title = fullFileName;
          newWindow.document.close();
        }
        document.title = prevDocTitle;
      }
    } else {
      if (action === 'view') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
        const customNameUri = `${cacheDirectory}${fullFileName}.pdf`;
        await writeAsStringAsync(customNameUri, base64 || '', {
          encoding: EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(customNameUri, {
            mimeType: 'application/pdf',
            dialogTitle: `${fullFileName}.pdf`
          });
        } else {
          throw new Error('La función de compartir no está disponible.');
        }
      }
    }
  } catch (error: any) {
    logger.error('Error generando PDF de recibo de pago:', error);
    if (Platform.OS === 'web') {
      window.alert('Error: No se pudo generar el documento PDF del pago. ' + (error?.message || ''));
    } else {
      Alert.alert('Error', 'No se pudo generar el documento PDF del pago. ' + (error?.message || ''));
    }
  }
}

