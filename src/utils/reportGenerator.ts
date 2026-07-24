import { logger } from './logger';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import { Gasto, Asistencia, Usuario, CompanyService } from '../services/supabase';
import { Cotizacion } from '@/types/ventas';

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
    tagline: 'INTEGRACIÃ“N DE TECNOLOGÃAS',
  };
};

export interface ReportProducto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  categoria_id: string;
  stock_actual: number;
  activo: boolean;
}

export interface ReportCategoria {
  id: string;
  nombre: string;
}

/**
 * Detecta si un gasto tiene alguna alerta de polÃ­tica (como alcohol, tabaco o montos sospechosos)
 */
const hasPolicyAlert = (g: Gasto): { alert: boolean; reason: string } => {
  const just = g.justificacion || '';
  
  // 1. Detectar si el formulario guardÃ³ una alerta estructurada de la IA
  const match = just.match(/^\[ALERTA IA:\s*([\s\S]*?)\]/);
  if (match) {
    return { alert: true, reason: match[1].trim() };
  }
  
  // 2. BÃºsqueda complementaria de palabras clave en la justificaciÃ³n, categorÃ­a, subcategorÃ­a o proveedor
  const textToSearch = `${just} ${g.categoria || ''} ${g.subcategoria || ''} ${g.proveedor || ''}`.toLowerCase();
  
  if (textToSearch.includes('alcohol') || textToSearch.includes('cerveza') || textToSearch.includes('vino') || textToSearch.includes('licor') || textToSearch.includes('bebida alcohÃ³lica')) {
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
   * Genera un reporte PDF de los gastos y lo comparte mediante la hoja nativa
   */
  async exportToPDF(gastos: Gasto[], title: string = 'Reporte de Control de Gastos'): Promise<void> {
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

      const { alert, reason } = hasPolicyAlert(g);
      let rowStyle = '';
      let alertLabel = '';
      if (alert) {
        // Fondo rojo suave y texto rojo oscuro para resaltar alertas
        rowStyle = `style="background-color: #ffebee; color: #b71c1c;"`;
        alertLabel = `<div style="color: #b71c1c; font-size: 8px; font-weight: bold; margin-top: 4px;">âš ï¸ ALERTA: ${reason}</div>`;
      }

      tableRows += `
        <tr ${rowStyle}>
          <td>${fecha}</td>
          <td>${g.empleado_nombre || 'Desconocido'}</td>
          <td>${g.proveedor || 'N/A'}</td>
          <td>
            ${g.categoria || 'N/A'} - ${g.subcategoria || ''}
            ${alertLabel}
          </td>
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
            font-size: 22px;
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
            width: 32px;
            height: 32px;
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
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">${branding.name}</span><br/>
                    <span class="logo-tagline">${branding.tagline}</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" style="width: 32px; height: 32px; object-fit: contain;" />
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
              <th style="width: 12%">Fecha</th>
              <th style="width: 20%">Empleado</th>
              <th style="width: 18%">Proveedor</th>
              <th style="width: 20%">CategorÃ­a</th>
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
          Documento Confidencial - Control de Gastos INTTEC - Sistema Automatizado
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
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating PDF report:', error);
      throw new Error(error.message || 'Error al generar el reporte PDF.');
    }
  },

  /**
   * Genera un archivo CSV de los gastos y lo comparte mediante la hoja nativa
   */
  async exportToCSV(gastos: Gasto[], fileName: string = 'reporte_gastos.csv'): Promise<void> {
    if (gastos.length === 0) {
      throw new Error('No hay gastos para exportar.');
    }

    // Encabezados
    let csvContent = '\uFEFF'; // BOM para que Excel abra UTF-8 correctamente
    csvContent += 'ID,Fecha,Empleado Nombre,Monto,Categoria,Subcategoria,Proveedor,Cliente,Servicio/Proyecto,Detalle,Sucursal,Metodo Pago,Tipo Tarjeta,Estado Factura,Motivo Sin Factura,Status,Alerta Politica\n';

    // Rellenar filas
    gastos.forEach((g) => {
      const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const { alert, reason } = hasPolicyAlert(g);

      let estadoFactura = 'No Facturado';
      if (g.facturado === true) {
        estadoFactura = 'Facturado';
      } else if (g.motivo_sin_factura === 'PENDIENTE_ENTREGA' || g.motivo_sin_factura?.toLowerCase().includes('pendiente')) {
        estadoFactura = 'Pendiente de Entregar';
      }

      const row = [
        g.id,
        fecha,
        escape(g.empleado_nombre),
        g.monto,
        escape(g.categoria),
        escape(g.subcategoria),
        escape(g.proveedor),
        escape(g.cliente),
        escape(g.tipo_servicio_proyecto),
        escape(g.detalle_servicio_proyecto),
        escape(g.sucursal),
        g.metodo_pago,
        escape(g.tipo_tarjeta),
        escape(estadoFactura),
        escape(g.motivo_sin_factura),
        g.status,
        alert ? escape(`ALERTA: ${reason}`) : '',
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Guardar el archivo en el sistema de archivos local de Expo (en cacheDirectory para compartir de forma segura)
      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      // Compartir nativamente
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating CSV report:', error);
      throw new Error(error.message || 'Error al generar el reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF del consumo de gasolina y lo comparte
   */
  async exportGasolinaToPDF(
    registros: any[],
    title: string = 'Reporte de Consumo de Gasolina'
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
          .logo-img { width: 52px; height: 52px; object-fit: contain; }
          .logo-brand { font-size: 22px; font-weight: 900; color: #0ea5e9; letter-spacing: 2px; }
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
          <div>
            <div class="logo-brand">${branding.name}</div>
            <div class="logo-tagline">${branding.tagline}</div>
          </div>
          <div style="margin-left:auto; text-align:right">
            <h1>${title}</h1>
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
              <th>VehÃ­culo</th>
              <th>Litros</th>
              <th>OdÃ³metro</th>
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
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating gasolina PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte PDF de gasolina.');
    }
  },

  /**
   * Genera un CSV del consumo de gasolina y lo comparte/descarga
   */
  async exportGasolinaToCSV(
    registros: any[],
    fileName: string = 'reporte_gasolina.csv'
  ): Promise<void> {
    if (registros.length === 0) {
      throw new Error('No hay registros de gasolina para exportar.');
    }

    const escape = (text?: string | null) => {
      if (!text) return '';
      return `"${String(text).replace(/"/g, '""')}"`;
    };

    let csvContent = '\uFEFF'; // BOM para Excel UTF-8
    csvContent += 'Fecha,Empresa Registradora,Conductor,Vehículo Marca,Vehículo Modelo,Placas,Km Anterior,Km Actual,Distancia Recorrida (km),Litros,Rendimiento (km/L),Costo Total (MXN),Observaciones\n';

    registros.forEach((r) => {
      const dateParts = (r.fecha || '').split('-');
      const fecha = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : r.fecha;
      const row = [
        fecha,
        escape(r.empresa_origen || 'N/A'),
        escape(r.empleado_nombre),
        escape(r.vehiculo_marca),
        escape(r.vehiculo_modelo),
        escape(r.vehiculo_placas),
        r.kilometraje_anterior ?? 'N/A',
        r.kilometraje_actual || 0,
        r.distancia_recorrida ?? 'N/A',
        Number(r.litros || 0).toFixed(2),
        r.rendimiento_km_l ? `${r.rendimiento_km_l} km/L` : 'N/A',
        Number(r.costo_total || 0).toFixed(2),
        escape(r.observaciones),
      ].join(',');
      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, { encoding: EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible en este dispositivo.');
      }
    } catch (error: any) {
      logger.error('Error generating gasolina CSV:', error);
      throw new Error(error.message || 'Error al generar el reporte CSV de gasolina.');
    }
  },


  async exportAsistenciasToPDF(
    asistencias: Asistencia[],
    personal: Usuario[],
    title: string = 'Reporte de Asistencia INTTEC'
  ): Promise<void> {
    if (asistencias.length === 0) {
      throw new Error('No hay registros de asistencia para exportar.');
    }
    const branding = await getCompanyBranding();

    const empleadosMap = new Map(personal.map((p) => [p.id, p.nombre]));

    let tableRows = '';
    asistencias.forEach((a) => {
      const empleadoNombre = empleadosMap.get(a.empleado_id) || 'Desconocido';
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
            font-size: 22px;
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
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">${branding.name}</span><br/>
                    <span class="logo-tagline">${branding.tagline}</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" style="width: 32px; height: 32px; object-fit: contain;" />
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
              <th style="width: 30%">UbicaciÃ³n Entrada</th>
              <th style="width: 10%">Salida</th>
              <th style="width: 30%">UbicaciÃ³n Salida</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Asistencias INTTEC - Sistema Automatizado
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
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating attendance PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de asistencia.');
    }
  },

  /**
   * Genera un archivo CSV de asistencia y lo comparte
   */
  async exportAsistenciasToCSV(
    asistencias: Asistencia[],
    personal: Usuario[],
    fileName: string = 'reporte_asistencia.csv'
  ): Promise<void> {
    if (asistencias.length === 0) {
      throw new Error('No hay registros de asistencia para exportar.');
    }

    const empleadosMap = new Map(personal.map((p) => [p.id, p.nombre]));

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'ID Registro,Fecha,Empleado,Hora Entrada,UbicaciÃ³n Entrada,Hora Salida,UbicaciÃ³n Salida\n';

    asistencias.forEach((a) => {
      const empleadoNombre = empleadosMap.get(a.empleado_id) || 'Desconocido';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        a.id,
        a.fecha || '',
        escape(empleadoNombre),
        a.hora_entrada || '',
        escape(a.direccion_entrada),
        a.hora_salida || '',
        escape(a.direccion_salida),
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Asistencia CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating attendance CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF de inventario y lo comparte
   */
  async exportInventarioToPDF(
    productos: ReportProducto[],
    categorias: ReportCategoria[],
    title: string = 'Reporte de Inventario INTTEC'
  ): Promise<void> {
    if (productos.length === 0) {
      throw new Error('No hay productos en el inventario para exportar.');
    }
    const branding = await getCompanyBranding();

    const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

    let tableRows = '';
    productos.forEach((p) => {
      const categoriaNombre = categoriasMap.get(p.categoria_id) || 'N/A';
      const statusLabel = p.activo ? 'Activo' : 'Inactivo';
      const statusColor = p.activo ? '#4CAF50' : '#F44336';
      const stockColor = p.stock_actual === 0 ? '#F44336' : p.stock_actual <= 5 ? '#FFC107' : '#333';

      tableRows += `
        <tr>
          <td>${p.sku_interno || 'N/A'}</td>
          <td style="font-weight: bold;">${p.nombre_oficial || 'N/A'}</td>
          <td>${categoriaNombre}</td>
          <td style="text-align: right; font-weight: bold; color: ${stockColor};">${p.stock_actual} pzas</td>
          <td><span style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></td>
        </tr>
      `;
    });

    const totalStock = productos.reduce((sum, p) => sum + Number(p.stock_actual), 0);
    const activeProducts = productos.filter((p) => p.activo).length;

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
            font-size: 22px;
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
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">${branding.name}</span><br/>
                    <span class="logo-tagline">${branding.tagline}</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" style="width: 32px; height: 32px; object-fit: contain;" />
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
                <div class="label">Total ArtÃ­culos CatÃ¡logo</div>
                <div class="value">${productos.length}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 5px; padding-right: 5px; border: none;">
              <div class="summary-card">
                <div class="label">Productos Activos</div>
                <div class="value" style="color: #4CAF50;">${activeProducts}</div>
              </div>
            </td>
            <td style="width: 33%; padding-left: 10px; border: none;">
              <div class="summary-card">
                <div class="label">Total Existencias Stock</div>
                <div class="value" style="color: #1b4965;">${totalStock}</div>
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 15%">SKU Interno</th>
              <th style="width: 40%">Nombre Oficial</th>
              <th style="width: 20%">CategorÃ­a</th>
              <th style="width: 15%; text-align: right;">Existencias</th>
              <th style="width: 10%">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Inventario INTTEC - Sistema Automatizado
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
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating inventory PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de inventario.');
    }
  },

  /**
   * Genera un archivo CSV de inventario y lo comparte
   */
  async exportInventarioToCSV(
    productos: ReportProducto[],
    categorias: ReportCategoria[],
    fileName: string = 'reporte_inventario.csv'
  ): Promise<void> {
    if (productos.length === 0) {
      throw new Error('No hay productos en el inventario para exportar.');
    }

    const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'SKU Interno,Nombre Oficial,CategorÃ­a,Stock Actual,Estado (Activo)\n';

    productos.forEach((p) => {
      const categoriaNombre = categoriasMap.get(p.categoria_id) || 'N/A';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        escape(p.sku_interno),
        escape(p.nombre_oficial),
        escape(categoriaNombre),
        p.stock_actual,
        p.activo ? 'Activo' : 'Inactivo',
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Inventario CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating inventory CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF del historial de consumos y lo comparte
   */
  async exportConsumosToPDF(
    consumos: any[],
    title: string = 'Reporte de Consumos de Materiales'
  ): Promise<void> {
    if (consumos.length === 0) {
      throw new Error('No hay registros de consumo para exportar.');
    }
    const branding = await getCompanyBranding();

    let tableRows = '';
    consumos.forEach((c) => {
      const fecha = c.fecha ? c.fecha.split('T')[0] : '';
      const productoNombre = c.producto?.nombre_oficial || 'Producto Eliminado';
      const cantidad = c.cantidad || 0;
      const referencia = c.folio_factura || 'N/A';

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td style="font-weight: bold;">${productoNombre}</td>
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
            font-size: 22px;
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
            width: 32px;
            height: 32px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <table style="display: inline-table; border-collapse: collapse; border: none;">
                <tr>
                  <td style="text-align: right; vertical-align: middle; padding-right: 10px; border: none;">
                    <span class="logo-brand">${branding.name}</span><br/>
                    <span class="logo-tagline">${branding.tagline}</span>
                  </td>
                  <td style="vertical-align: middle; border: none; padding: 0;">
                    <img class="logo-img" src="${branding.logo}" style="width: 32px; height: 32px; object-fit: contain;" />
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
              <th style="width: 15%">Fecha</th>
              <th style="width: 45%">Producto</th>
              <th style="width: 15%; text-align: right;">Cantidad</th>
              <th style="width: 25%">Referencia/Trabajo</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Historial de Consumos INTTEC - Sistema Automatizado
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
      const pdfFileName = `reporte_consumos_${Date.now()}.pdf`;
      const safeUri = `${cacheDirectory}${pdfFileName}`;
      
      await writeAsStringAsync(safeUri, base64 || '', {
        encoding: EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar Reporte Consumos PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating consumptions PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de consumos.');
    }
  },

  /**
   * Genera un archivo CSV de consumos y lo comparte
   */
  async exportConsumosToCSV(
    consumos: any[],
    fileName: string = 'reporte_consumos.csv'
  ): Promise<void> {
    if (consumos.length === 0) {
      throw new Error('No hay registros de consumo para exportar.');
    }

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'ID Movimiento,Fecha,Producto,Cantidad,Referencia/Trabajo\n';

    consumos.forEach((c) => {
      const fecha = c.fecha ? c.fecha.split('T')[0] : '';
      const productoNombre = c.producto?.nombre_oficial || 'Producto Eliminado';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const row = [
        c.id,
        fecha,
        escape(productoNombre),
        c.cantidad,
        escape(c.folio_factura),
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Consumos CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating consumptions CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV.');
    }
  },

  /**
   * Genera un reporte PDF de las ventas registradas y lo comparte
   */
  async exportVentasToPDF(
    ventas: any[],
    title: string = 'Reporte de Ventas INTTEC'
  ): Promise<void> {
    if (ventas.length === 0) {
      throw new Error('No hay registros de ventas para exportar.');
    }

    const branding = await getCompanyBranding();

    const totalFacturado = ventas.reduce((sum, v) => sum + Number(v.precio_total_facturado || 0), 0);
    const totalCosto = ventas.reduce((sum, v) => sum + Number(v.costo_total || 0), 0);
    const totalUtilidad = totalFacturado - totalCosto;
    const margenConsolidado = totalFacturado > 0 ? (totalUtilidad / totalFacturado) * 100 : 0;

    let tableRows = '';
    ventas.forEach((v) => {
      const fecha = v.fecha || '';
      const facturadoFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(v.precio_total_facturado || 0));

      const costoFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(v.costo_total || 0));

      const utilidadFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(v.utilidad_bruta || 0));

      const margenPercent = ((v.margen_porcentual || 0) * 100).toFixed(1) + '%';
      const isProfit = Number(v.utilidad_bruta || 0) >= 0;

      tableRows += `
        <tr>
          <td>${fecha}</td>
          <td>
            <div style="font-weight: bold;">${v.cliente || 'N/A'}</div>
            ${v.factura_referencia ? `<span style="font-size: 9px; color: #777;">Ref: ${v.factura_referencia}</span>` : ''}
          </td>
          <td>${v.tipo_proyecto || 'N/A'}</td>
          <td>${v.proveedor || 'N/A'}</td>
          <td style="text-align: right; color: #0d1b2a; font-weight: bold;">${facturadoFormatted}</td>
          <td style="text-align: right; color: #f44336;">${costoFormatted}</td>
          <td style="text-align: right; color: ${isProfit ? '#4CAF50' : '#F44336'}; font-weight: bold;">${utilidadFormatted}</td>
          <td style="text-align: right; color: ${isProfit ? '#4CAF50' : '#F44336'}; font-weight: bold;">${margenPercent}</td>
        </tr>
      `;
    });

    const formatCurr = (val: number) =>
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

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
            font-size: 16px;
            font-weight: bold;
            color: #0d1b2a;
            margin-top: 5px;
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
        </style>
      </head>
      <body>
        <table style="width: 100%; border-collapse: collapse; border-bottom: 3px solid #0d1b2a; padding-bottom: 15px; margin-bottom: 20px; border: none;">
          <tr>
            <td style="vertical-align: middle; border: none; padding: 0;">
              <h1 class="title" style="margin: 0; font-size: 24px; font-weight: bold; color: #0d1b2a;">${title}</h1>
              <p class="subtitle" style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Generado el: ${new Date().toLocaleString()}</p>
            </td>
            <td style="text-align: right; vertical-align: middle; border: none; padding: 0;">
              <img src="${branding.logo}" style="width: 60px; height: 60px; object-fit: contain;" />
            </td>
          </tr>
        </table>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Facturado</div>
            <div class="value" style="color: #0d1b2a;">${formatCurr(totalFacturado)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Costo Proveedores</div>
            <div class="value" style="color: #f44336;">${formatCurr(totalCosto)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Utilidad Consolidada</div>
            <div class="value" style="color: ${totalUtilidad >= 0 ? '#4CAF50' : '#f44336'};">${formatCurr(totalUtilidad)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Margen Consolidado</div>
            <div class="value" style="color: ${totalUtilidad >= 0 ? '#4CAF50' : '#f44336'};">${margenConsolidado.toFixed(1)}%</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">Fecha</th>
              <th style="width: 25%">Cliente / Ref</th>
              <th style="width: 13%">Tipo</th>
              <th style="width: 15%">Sucursal</th>
              <th style="width: 13%; text-align: right;">Venta</th>
              <th style="width: 10%; text-align: right;">Costo</th>
              <th style="width: 12%; text-align: right;">Utilidad</th>
              <th style="width: 10%; text-align: right;">Margen</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Documento Confidencial - Control de Ventas e Ingresos INTTEC - Sistema Automatizado
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
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating sales PDF:', error);
      throw new Error(error.message || 'Error al generar el reporte de ventas.');
    }
  },

  /**
   * Genera un archivo CSV de ventas y lo comparte
   */
  async exportVentasToCSV(
    ventas: any[],
    fileName: string = 'reporte_ventas.csv'
  ): Promise<void> {
    if (ventas.length === 0) {
      throw new Error('No hay registros de ventas para exportar.');
    }

    let csvContent = '\uFEFF'; // BOM
    csvContent += 'ID Venta,Fecha,Cliente,Referencia/Factura,Tipo Proyecto,Sucursal,Total Facturado (Venta),Total Costo (Proveedor),Utilidad Bruta,Margen %\n';

    ventas.forEach((v) => {
      const fecha = v.fecha || '';
      const escape = (text?: string | null) => {
        if (!text) return '';
        const cleaned = text.replace(/"/g, '""');
        return `"${cleaned}"`;
      };

      const margenPercent = ((v.margen_porcentual || 0) * 100).toFixed(2);

      const row = [
        v.id,
        fecha,
        escape(v.cliente),
        escape(v.factura_referencia),
        escape(v.tipo_proyecto),
        escape(v.proveedor),
        Number(v.precio_total_facturado || 0).toFixed(2),
        Number(v.costo_total || 0).toFixed(2),
        Number(v.utilidad_bruta || 0).toFixed(2),
        margenPercent + '%',
      ].join(',');

      csvContent += row + '\n';
    });

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const fileUri = `${cacheDirectory}${fileName}`;
      await writeAsStringAsync(fileUri, csvContent, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Reporte Ventas CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        throw new Error('La funciÃ³n de compartir no estÃ¡ disponible.');
      }
    } catch (error: any) {
      logger.error('Error generating sales CSV:', error);
      throw new Error(error.message || 'Error al generar reporte CSV de ventas.');
    }
  },
};

export async function exportarCotizacionOdooPDF(cotizacion: Cotizacion, action: 'view' | 'download' = 'view') {
  const branding = await getCompanyBranding();
  const title = `Cotizacion - ${cotizacion.numeroCotizacion}`;
  
  const renderDescription = (name: string, description: string) => {
    const fullText = (name || '') + (description ? '\n' + description : '');
    const parts = fullText.split('\n');
    return parts.map((part, part_index) => {
      const clean_part = part.trim();
      if (clean_part === '') return '<br/>';
      
      if (part_index === 0) {
        const innerHtml = `<strong style="color: #111; font-size: 12.5px;">${clean_part.replace(/\*/g, '')}</strong>`;
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
      <style>
        @page {
          size: letter;
          margin: 0;
        }
        body {
          font-family: 'Helvetica', Arial, sans-serif;
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
            <div>MÃ©xico</div>
          </div>
        </div>

        <div class="page-body">
          <div class="row mb-4" style="margin-top: -15px;">
              <div class="col-6">
              </div>
              <div class="col-6 text-end">
                  <h1 class="inttec-red fw-bold" style="font-size: 26px; letter-spacing: 1px; margin-bottom: 2px; margin-top: 0;">COTIZACIÃ“N</h1>
                  <h2 class="text-muted" style="font-size: 20px; font-weight: normal; margin-top: 0;">${cotizacion.numeroCotizacion}</h2>
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
                      <th width="40%" style="text-align: left;">DESCRIPCIÃ“N</th>
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
                          <td class="text-end">$ ${linea.precioUnitario.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          
                          <td class="text-center">
                              ${linea.impuestoPorcentaje}%
                          </td>

                          <td class="text-end">$ ${linea.importe.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                  `).join('')}
              </tbody>
          </table>

          <div class="row mt-4">
              <div class="col-7">
                  <div class="info-text mt-2">
                      <div class="section-header">Informacion Adicional</div>
                      <div style="padding-top: 4px;">
                        TÃ©rminos y condiciones: <a href="${cotizacion.terminosCondiciones}" style="color: #0000ee; text-decoration: none;">${cotizacion.terminosCondiciones}</a>
                      </div>
                  </div>
              </div>
              <div class="col-5">
                  <table class="table-totals">
                      <tr><td>Subtotal</td><td class="text-end">$ ${cotizacion.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                      <tr><td>IVA 16%</td><td class="text-end">$ ${cotizacion.iva.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                      <tr>
                          <td>TOTAL</td>
                          <td class="text-end">$ ${cotizacion.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
            PÃ¡gina 1 / 1
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

          iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          };
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
        // En mÃ³viles, para "solo ver", usamos printAsync que abre el visor de impresiÃ³n nativo (muy bueno para visualizar)
        await Print.printAsync({ html: htmlContent });
      } else {
        // Para "descargar", generamos el archivo fÃ­sico y abrimos el menÃº de compartir/guardar
        const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
        
        const customNameUri = `${cacheDirectory}Cotizacion - ${cotizacion.numeroCotizacion}.pdf`;
        await writeAsStringAsync(customNameUri, base64 || '', {
          encoding: EncodingType.Base64,
        });

        await Sharing.shareAsync(customNameUri, { mimeType: 'application/pdf', dialogTitle: 'Compartir CotizaciÃ³n' });
      }
    }
  } catch (error: any) {
    logger.error('Error generando PDF:', error);
    if (Platform.OS === 'web') {
      window.alert('Error: No se pudo generar el documento PDF corporativo. ' + (error.message || ''));
    } else {
      Alert.alert('Error', 'No se pudo generar el documento PDF corporativo. ' + (error.message || ''));
    }
  }
}




export async function exportarFacturaOdooPDF(venta, facturaData, action = 'view') {
  const branding = await getCompanyBranding();
  const title = `Factura - ${facturaData.folio_number || facturaData.uuid}`;
  
  // Formatters
  const formatMoney = (val) => `$ ${Number(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page { size: letter; margin: 0; }
        body { font-family: 'Helvetica', Arial, sans-serif; color: #333; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .page-container { width: 100%; min-height: 100vh; box-sizing: border-box; position: relative; }
        .header-content { padding: 15px 40px 0 40px; display: flex; justify-content: space-between; align-items: flex-start; height: 174px; position: relative; z-index: 10; }
        .company-details { text-align: right; font-size: 11px; line-height: 1.4; color: #333; margin-top: 5px; }
        .page-body { padding: 0px 40px 100px 40px; position: relative; z-index: 10; margin-top: -50px; }
        .row { display: flex; flex-wrap: wrap; margin-bottom: 20px; }
        .col-6 { width: 50%; box-sizing: border-box; }
        .col-7 { width: 58.333333%; box-sizing: border-box; padding-right: 20px; }
        .col-5 { width: 41.666667%; box-sizing: border-box; }
        .text-end { text-align: right; }
        .text-center { text-align: center; }
        .fw-bold { font-weight: bold; }
        .mb-4 { margin-bottom: 24px; }
        .mt-4 { margin-top: 24px; }
        .mt-2 { margin-top: 8px; }
        .ps-1 { padding-left: 2px; }
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
        .footer-bank { position: relative; border-top: 1px solid #000; padding-top: 10px; font-size: 9px; color: #333; line-height: 1.4; display: flex; justify-content: space-between; margin-top: 40px; margin-bottom: 20px;}
        .footer-bank strong { color: #111; font-weight: bold; }
        .sat-block { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 20px; display: flex; gap: 20px; page-break-inside: avoid; }
        .sat-qr { width: 130px; height: 130px; flex-shrink: 0; }
        .sat-info { flex: 1; font-size: 7px; color: #555; word-break: break-all; line-height: 1.2; }
        .sat-title { font-weight: bold; color: #333; margin-top: 6px; margin-bottom: 2px; font-size: 8px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="page-container">
        <!-- HEADER BG ODOO -->
        <div style="position: absolute; top: -90px; left: 0; width: 100%; height: 174px; z-index: 1;">
            <div style="position: absolute; top: 87px; left: 0; width: 100%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <div style="position: absolute; top: 174px; left: 0; width: 60%; height: 0; border-top: 87px solid #EAE6E2;"></div>
            <div style="position: absolute; top: 174px; left: 60%; width: 0; height: 0; border-top: 87px solid #EAE6E2; border-right: 80px solid transparent;"></div>
        </div>
        
        <div class="header-content">
          <div style="width: 50%;">
            <img src="${branding.logo}" alt="Logo" style="max-height: 150px; height: 170px; width: 450px; object-fit: contain; margin-top: -10px; z-index: 10; position: relative;">
          </div>
          <div class="company-details" style="width: 50%;">
            <div style="font-weight: bold; font-size: 13px;">${branding.name}</div>
            <div>RFC: FETR83041461A</div>
            <div>Ozorno 811, 31107 Chihuahua, CHH</div>
            <div>Régimen Fiscal: 612</div>
          </div>
        </div>

        <div class="page-body">
          <div class="row mb-4" style="margin-top: -15px;">
              <div class="col-6"></div>
              <div class="col-6 text-end">
                  <h1 class="inttec-red fw-bold" style="font-size: 26px; letter-spacing: 1px; margin-bottom: 2px; margin-top: 0;">FACTURA</h1>
                  <h2 class="text-muted" style="font-size: 20px; font-weight: normal; margin-top: 0;">${facturaData.folio_number || (facturaData.uuid ? facturaData.uuid.split('-')[0] : '')}</h2>
              </div>
          </div>

          <div class="row mb-4">
              <div class="col-7">
                  <div class="section-header">Datos del Cliente</div>
                  <div class="info-text ps-1">
                      <strong style="font-size: 11px;">${facturaData.customer?.legal_name || venta.cliente}</strong><br/>
                      <strong>RFC:</strong> ${facturaData.customer?.tax_id || 'XAXX010101000'}<br/>
                      <strong>CP:</strong> ${facturaData.customer?.address?.zip || ''}<br/>
                      <strong>Régimen Fiscal:</strong> ${facturaData.customer?.tax_system || '616'}<br/>
                      <strong>Uso CFDI:</strong> ${facturaData.use || 'S01'}
                  </div>
              </div>
              <div class="col-5">
                  <div class="section-header">Detalles Comerciales</div>
                  <table class="table-details">
                      <tr><td class="label-col">Fecha Emisión:</td><td class="value-col">${formatDate(facturaData.created_at)}</td></tr>
                      <tr><td class="label-col">Método de Pago:</td><td class="value-col">${facturaData.payment_method || 'PUE'}</td></tr>
                      <tr><td class="label-col">Forma de Pago:</td><td class="value-col">${facturaData.payment_form || '01'}</td></tr>
                      <tr><td class="label-col">Moneda:</td><td class="value-col">MXN</td></tr>
                  </table>
              </div>
          </div>

          <table class="table table-red mt-4">
              <thead>
                  <tr>
                      <th width="15%" class="text-center">CLAVE SAT</th>
                      <th width="40%" style="text-align: left;">DESCRIPCIÓN</th>
                      <th class="text-center">CANT</th>
                      <th class="text-end">PRECIO UNIT</th>
                      <th class="text-center">IVA</th>
                      <th class="text-end">IMPORTE</th>
                  </tr>
              </thead>
              <tbody>
                  ${(facturaData.items || []).map((item) => `
                      <tr>
                          <td class="text-center">${item.product?.product_key || ''}<br/><span style="font-size: 8px;">(${item.product?.unit_key || ''})</span></td>
                          <td>${item.product?.description || ''}</td>
                          <td class="text-center">${item.quantity}</td>
                          <td class="text-end">${formatMoney(item.product?.price)}</td>
                          <td class="text-center">16%</td>
                          <td class="text-end">${formatMoney((item.quantity || 0) * (item.product?.price || 0))}</td>
                      </tr>
                  `).join('')}
              </tbody>
          </table>

          <div class="row mt-4">
              <div class="col-7">
                  <div class="info-text mt-2">
                      <div class="section-header">Informacion Adicional</div>
                      <div style="padding-top: 4px;">Este documento es una representación impresa de un CFDI 4.0</div>
                  </div>
              </div>
              <div class="col-5">
                  <table class="table-totals">
                      <tr><td>Subtotal</td><td class="text-end">${formatMoney(facturaData.subtotal || venta.subtotal_venta)}</td></tr>
                      <tr><td>IVA Trasladado</td><td class="text-end">${formatMoney(facturaData.taxes?.[0]?.amount || (venta.subtotal_venta * 0.16))}</td></tr>
                      <tr><td>TOTAL</td><td class="text-end">${formatMoney(facturaData.total || (venta.subtotal_venta * 1.16))}</td></tr>
                  </table>
              </div>
          </div>

          <!-- SAT Block -->
          ${facturaData.uuid ? `
          <div class="sat-block">
            ${facturaData.status === 'canceled' ? '<div style="position: absolute; top: 40%; left: 30%; transform: rotate(-45deg); font-size: 100px; color: rgba(255,0,0,0.15); font-weight: bold; border: 10px solid rgba(255,0,0,0.15); border-radius: 20px; padding: 20px; z-index: -1;">CANCELADO</div>' : ''}
            <div class="sat-qr">
              <img src="${facturaData.verification_url ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(facturaData.verification_url)}` : 'https://via.placeholder.com/150?text=QR'}" style="width: 100%; height: 100%;" />
            </div>
            <div class="sat-info">
              <div class="sat-title">Folio Fiscal (UUID)</div>
              <div>${facturaData.uuid}</div>
              
              <div class="sat-title">No. Certificado SAT</div>
              <div>${facturaData.stamp?.sat_cert_number || ''}</div>

              <div class="sat-title">Sello Digital del Emisor</div>
              <div>${facturaData.stamp?.signature || ''}</div>

              <div class="sat-title">Sello Digital del SAT</div>
              <div>${facturaData.stamp?.sat_signature || ''}</div>

              <div class="sat-title">Cadena Original del Complemento de Certificación Digital del SAT</div>
              <div>${facturaData.stamp?.original_chain || ''}</div>
            </div>
          </div>
          ` : ''}
          
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

          iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          };
        }
      } else {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        }
      }
    } else {
      if (action === 'view') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
        
        const customNameUri = `${cacheDirectory}Factura_${facturaData.folio_number || facturaData.uuid || venta.id}.pdf`;
        
        await writeAsStringAsync(customNameUri, base64 || '', {
          encoding: EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(customNameUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Compartir Factura CFDI'
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
