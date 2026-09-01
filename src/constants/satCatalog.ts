export interface SatClaveProdServ {
  clave: string;
  descripcion: string;
  categoria?: string;
  palabrasClave?: string[];
}

export interface SatClaveUnidad {
  clave: string;
  nombre: string;
  descripcion?: string;
  simbolo?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE PRODUCTOS Y SERVICIOS DEL SAT (500+ CLAVES MÁS USADAS)
// ─────────────────────────────────────────────────────────────────────────────
export const SAT_PRODUCTOS_SERVICIOS: SatClaveProdServ[] = [
  // ── 1. GPS, TELEMETRÍA, RASTREO SATELITAL E IOT ──
  { clave: '43222609', descripcion: 'Transmisor receptor o transceptor de rastreo o localizador (GPS / Rastreador)', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['gps', 'localizador', 'rastreador', 'transceptor', 'tracker', '4g', 'lte', 'seguimiento'] },
  { clave: '81111811', descripcion: 'Servicios de rastreo y monitoreo de vehículos o flotas', categoria: 'Servicios de Monitoreo', palabrasClave: ['monitoreo', 'rastreo', 'plataforma', 'flota', 'seguimiento', 'satelital', 'renta mensual', 'telemetria'] },
  { clave: '81111812', descripcion: 'Servicios de instalación de equipo de seguimiento o satelital', categoria: 'Servicios de Instalación', palabrasClave: ['instalacion', 'mano de obra', 'gps', 'equipo', 'vehicular', 'paro de motor', 'desinstalacion'] },
  { clave: '43222600', descripcion: 'Equipos de telecomunicaciones y transmisión de datos inalámbricos', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['telecomunicaciones', 'antenas', 'modem', 'router', 'transmision', 'radiofrecuencia'] },
  { clave: '43222800', descripcion: 'Accesorios y componentes de equipos de comunicaciones', categoria: 'Accesorios Telecom', palabrasClave: ['relevador', 'rele', 'arnes', 'sim', 'chip', 'antena', 'sensores', 'conector'] },
  { clave: '41112200', descripcion: 'Transductores y sensores de medición y control (Combustible, Temperatura, Presión)', categoria: 'Sensores e Instrumentos', palabrasClave: ['sensor de combustible', 'temperatura', 'sensor', 'canbus', 'obd', 'ble', 'varilla'] },
  { clave: '43221500', descripcion: 'Equipos de radiocomunicación y telecomunicaciones móviles', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['radio', 'walkie talkie', 'antena movil', 'base'] },
  { clave: '43222640', descripcion: 'Sistemas de telemetría y transmisión de datos remotos', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['telemetria', 'iot', 'datos remotos', 'scada', 'sensores'] },
  { clave: '43222610', descripcion: 'Módems celulares y equipos de enlace inalámbrico (4G, 5G, LTE)', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['modem 4g', 'modem 5g', 'gateway', 'iot', 'router industrial'] },
  { clave: '43221700', descripcion: 'Tarjetas SIM, micro SIM y nano SIM para comunicación móvil', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['sim card', 'chip telcel', 'chip at&t', 'datos celulares', 'm2m'] },
  { clave: '83111600', descripcion: 'Servicios de telefonía celular y transmisión de datos móviles', categoria: 'Servicios Telecom', palabrasClave: ['datos moviles', 'plan celular', 'megas', 'paquete de datos'] },

  // ── 2. SEGURIDAD ELECTRÓNICA, CCTV, VIGILANCIA Y ACCESO ──
  { clave: '46171610', descripcion: 'Equipo de vigilancia por video o cámaras de seguridad (CCTV / Dashcam / MDVR)', categoria: 'Seguridad y Video', palabrasClave: ['camara', 'cctv', 'dashcam', 'video', 'dvr', 'mdvr', 'grabador', 'vigilancia', 'domo'] },
  { clave: '46171600', descripcion: 'Sistemas y dispositivos de seguridad y vigilancia vehicular y fija', categoria: 'Seguridad y Video', palabrasClave: ['seguridad', 'alarma', 'sensor', 'boton de panico', 'chapa', 'bloqueo'] },
  { clave: '46171615', descripcion: 'Cámaras de seguridad IP, domos y cámaras infrarrojas', categoria: 'Seguridad y Video', palabrasClave: ['camara ip', 'infrarrojo', 'ptz', 'camara wifi'] },
  { clave: '46171620', descripcion: 'Grabadores digitales de video (DVR, NVR, MDVR para vehículos)', categoria: 'Seguridad y Video', palabrasClave: ['dvr', 'nvr', 'mdvr', 'grabador de video', 'disco duro vigilancia'] },
  { clave: '46171500', descripcion: 'Dispositivos de control de acceso y biométricos (Tarjetas, Huella, Rostro)', categoria: 'Seguridad y Video', palabrasClave: ['control de acceso', 'biometrico', 'lector huella', 'facial', 'tarjeta rfid'] },
  { clave: '46171602', descripcion: 'Sirenas, estrobos y botones de emergencia / pánico', categoria: 'Seguridad y Video', palabrasClave: ['sirena', 'estrobo', 'boton de panico', 'alarma sonora'] },
  { clave: '46171505', descripcion: 'Chapas magnéticas, contracerraduras y electroimanes', categoria: 'Seguridad y Video', palabrasClave: ['chapa magnetica', 'electroiman', 'cerradura digital', 'pestillo'] },
  { clave: '92121500', descripcion: 'Servicios de guardias de seguridad privada y vigilancia física', categoria: 'Servicios de Seguridad', palabrasClave: ['guardias', 'vigilancia', 'seguridad privada', 'custodia'] },
  { clave: '92121700', descripcion: 'Servicios de monitoreo de alarmas y respuesta de seguridad 24/7', categoria: 'Servicios de Seguridad', palabrasClave: ['monitoreo de alarma', 'central de monitoreo', 'respuesta armada', 'c4'] },

  // ── 3. SERVICIOS DE INSTALACIÓN, MANTENIMIENTO Y SOPORTE TI ──
  { clave: '72151600', descripcion: 'Servicios de instalación de sistemas de telecomunicaciones o seguridad', categoria: 'Servicios de Instalación', palabrasClave: ['instalacion', 'telecomunicaciones', 'seguridad', 'camaras', 'cctv', 'cableado'] },
  { clave: '72151500', descripcion: 'Servicios de instalación eléctrica y cableado de bajo y alto voltaje', categoria: 'Servicios de Instalación', palabrasClave: ['instalacion electrica', 'cableado', 'tableros', 'iluminacion'] },
  { clave: '72151700', descripcion: 'Servicios de instalación de sistemas de redes de datos y voz (Cableado estructurado)', categoria: 'Servicios de Instalación', palabrasClave: ['cableado estructurado', 'fibra optica', 'redes', 'rack', 'patch panel'] },
  { clave: '81112200', descripcion: 'Servicios de mantenimiento y soporte de sistemas de software y cómputo', categoria: 'Software y TI', palabrasClave: ['soporte', 'mantenimiento', 'actualizacion', 'mesa de ayuda', 'help desk'] },
  { clave: '81112300', descripcion: 'Servicios de mantenimiento y reparación de hardware y computadoras', categoria: 'Hardware y Cómputo', palabrasClave: ['reparacion pc', 'mantenimiento preventivo', 'limpieza laptop', 'cambio pantalla'] },
  { clave: '81111800', descripcion: 'Servicios de administración de sistemas y soporte de tecnologías de información', categoria: 'Software y TI', palabrasClave: ['administracion servidores', 'soporte ti', 'sysadmin', 'redes ti'] },

  // ── 4. SOFTWARE, LICENCIAS, SAAS Y DESARROLLO ──
  { clave: '43231500', descripcion: 'Software de aplicaciones para negocios o plataformas digitales', categoria: 'Software y TI', palabrasClave: ['software', 'plataforma', 'sistema', 'app', 'portal', 'licencia', 'erp', 'crm'] },
  { clave: '81112500', descripcion: 'Servicios de licencias de computación o plataformas SaaS', categoria: 'Software y TI', palabrasClave: ['licencia', 'suscripcion', 'mensualidad', 'anualidad', 'saas', 'plataforma'] },
  { clave: '81111500', descripcion: 'Servicios de ingeniería de software o desarrollo a la medida', categoria: 'Software y TI', palabrasClave: ['desarrollo', 'programacion', 'ingenieria', 'software', 'codigo', 'web', 'backend', 'frontend'] },
  { clave: '81112000', descripcion: 'Servicios de almacenamiento de datos o servidores en la nube', categoria: 'Software y TI', palabrasClave: ['hosting', 'servidor', 'cloud', 'almacenamiento', 'backup', 'aws', 'azure'] },
  { clave: '81112100', descripcion: 'Servicios de diseño, desarrollo y mantenimiento de páginas y sitios web', categoria: 'Software y TI', palabrasClave: ['pagina web', 'sitio web', 'ecommerce', 'tienda en linea', 'desarrollo web'] },
  { clave: '43232400', descripcion: 'Software de herramientas de desarrollo y lenguajes de programación', categoria: 'Software y TI', palabrasClave: ['herramientas dev', 'ide', 'compilador', 'framework'] },
  { clave: '43232800', descripcion: 'Software de seguridad de redes y computadoras (Antivirus, Firewall)', categoria: 'Software y TI', palabrasClave: ['antivirus', 'firewall', 'seguridad informatica', 'vpn'] },
  { clave: '43232100', descripcion: 'Software de gestión y administración de bases de datos', categoria: 'Software y TI', palabrasClave: ['sql', 'base de datos', 'oracle', 'postgres', 'mysql'] },
  { clave: '81111700', descripcion: 'Servicios de diseño y arquitectura de sistemas informáticos', categoria: 'Software y TI', palabrasClave: ['arquitectura ti', 'diseño de sistemas', 'consultoria ti'] },

  // ── 5. HARDWARE, EQUIPOS DE CÓMPUTO Y ELECTRÓNICA ──
  { clave: '43211500', descripcion: 'Computadoras personales, laptops o servidores', categoria: 'Hardware y Cómputo', palabrasClave: ['computadora', 'laptop', 'pc', 'servidor', 'desktop', 'macbook'] },
  { clave: '43211600', descripcion: 'Accesorios y periféricos de computadora (Teclados, Ratones, Pantallas)', categoria: 'Hardware y Cómputo', palabrasClave: ['monitor', 'pantalla', 'teclado', 'mouse', 'periferico', 'webcam'] },
  { clave: '43211701', descripcion: 'Discos duros mecánicos (HDD) y unidades de estado sólido (SSD)', categoria: 'Hardware y Cómputo', palabrasClave: ['disco duro', 'ssd', 'nvme', 'm2', 'almacenamiento'] },
  { clave: '43211900', descripcion: 'Memorias RAM y módulos de memoria para computadoras', categoria: 'Hardware y Cómputo', palabrasClave: ['memoria ram', 'ddr4', 'ddr5', 'memoria sodimm'] },
  { clave: '43212100', descripcion: 'Impresoras multifuncionales, láser y térmicas de tickets', categoria: 'Hardware y Cómputo', palabrasClave: ['impresora', 'multifuncional', 'impresora termica', 'tickets', 'etiquetas'] },
  { clave: '44103100', descripcion: 'Cartuchos de tóner, tinta y cintas para impresión', categoria: 'Consumibles de Cómputo', palabrasClave: ['toner', 'tinta', 'cartucho', 'hp', 'epson', 'canon'] },
  { clave: '43201400', descripcion: 'Dispositivos de red (Switches, Routers, Access Points, Firewalls)', categoria: 'Hardware y Cómputo', palabrasClave: ['switch', 'router', 'access point', 'red', 'wifi', 'cisco', 'ubiquiti', 'mikrotik'] },
  { clave: '43222605', descripcion: 'Antenas de comunicación inalámbrica y repetidores de señal', categoria: 'Telecomunicaciones y GPS', palabrasClave: ['antena wifi', 'antena gps', 'repetidor', 'antena lte'] },
  { clave: '26121600', descripcion: 'Cables eléctricos y de comunicaciones (Cable de red UTP, Automotriz)', categoria: 'Materiales Eléctricos', palabrasClave: ['cable', 'cableado', 'utp', 'automotriz', 'arnes', 'cat6', 'cat5e'] },
  { clave: '26121609', descripcion: 'Cables de fibra óptica para telecomunicaciones', categoria: 'Materiales Eléctricos', palabrasClave: ['fibra optica', 'patch cord fibra', 'monomodo', 'multimodo'] },
  { clave: '26111700', descripcion: 'Baterías, pilas y acumuladores recargables', categoria: 'Baterías y Energía', palabrasClave: ['bateria', 'pila', 'acumulador', 'respaldo', 'ups', 'no break', 'plomo'] },
  { clave: '39121011', descripcion: 'Sistemas de alimentación ininterrumpida (UPS / No-breaks)', categoria: 'Baterías y Energía', palabrasClave: ['ups', 'no break', 'regulador de voltaje', 'respaldo electrico'] },
  { clave: '39121400', descripcion: 'Tomas de corriente, clavijas y conectores eléctricos', categoria: 'Materiales Eléctricos', palabrasClave: ['conector', 'terminal', 'porta fusible', 'fusible', 'clema', 'cople'] },
  { clave: '39121600', descripcion: 'Disyuntores, interruptores termomagnéticos y relevadores', categoria: 'Materiales Eléctricos', palabrasClave: ['relevador', 'rele', 'pastilla termica', 'breaker', 'fusible automotriz'] },
  { clave: '41113600', descripcion: 'Instrumentos de medición eléctrica (Multímetros, Amperímetros)', categoria: 'Sensores e Instrumentos', palabrasClave: ['multimetro', 'amperimetro', 'tester', 'probador de cable'] },

  // ── 6. SERVICIOS PROFESIONALES, ADMINISTRATIVOS Y CONSULTORÍA ──
  { clave: '80141600', descripcion: 'Actividades de ventas, marketing y comercialización', categoria: 'Servicios Profesionales', palabrasClave: ['ventas', 'marketing', 'comercial', 'publicidad', 'leads'] },
  { clave: '80101500', descripcion: 'Servicios de consultoría empresarial o de gestión de negocios', categoria: 'Servicios Profesionales', palabrasClave: ['consultoria', 'asesoria', 'capacitacion', 'gestion', 'estrategia'] },
  { clave: '84111506', descripcion: 'Servicios de facturación o gestión de cobros y facturas (PAC / Timbrado)', categoria: 'Servicios Financieros', palabrasClave: ['facturacion', 'timbrado', 'administracion', 'cobro', 'finkok'] },
  { clave: '84111500', descripcion: 'Servicios de contabilidad, teneduría de libros y auditoría', categoria: 'Servicios Financieros', palabrasClave: ['contabilidad', 'auditoria', 'fiscal', 'impuestos', 'declaraciones', 'sat'] },
  { clave: '80121500', descripcion: 'Servicios jurídicos y asesoría legal corporativa', categoria: 'Servicios Profesionales', palabrasClave: ['abogados', 'legal', 'contratos', 'notaria', 'juridico'] },
  { clave: '80111600', descripcion: 'Servicios de personal temporal o subcontratación de personal', categoria: 'Servicios Profesionales', palabrasClave: ['personal', 'staffing', 'mano de obra', 'reclutamiento'] },
  { clave: '80111700', descripcion: 'Servicios de reclutamiento y selección de personal', categoria: 'Servicios Profesionales', palabrasClave: ['reclutamiento', 'headhunting', 'seleccion', 'recursos humanos'] },
  { clave: '80141500', descripcion: 'Servicios de investigación de mercados y sondeos de opinión', categoria: 'Servicios Profesionales', palabrasClave: ['estudio de mercado', 'encuestas', 'analisis de mercado'] },
  { clave: '82101500', descripcion: 'Servicios de publicidad y campañas en medios digitales y tradicionales', categoria: 'Servicios Profesionales', palabrasClave: ['publicidad', 'anuncios', 'google ads', 'facebook ads', 'redes sociales'] },
  { clave: '82141500', descripcion: 'Servicios de diseño gráfico, identidad corporativa y arte digital', categoria: 'Servicios Profesionales', palabrasClave: ['diseño grafico', 'logotipo', 'branding', 'flyers', 'lonas'] },
  { clave: '86101500', descripcion: 'Servicios de capacitación y cursos de adiestramiento profesional', categoria: 'Educación y Capacitación', palabrasClave: ['cursos', 'capacitacion', 'taller', 'certificacion', 'entrenamiento'] },
  { clave: '84121500', descripcion: 'Servicios bancarios, comisiones y servicios de instituciones financieras', categoria: 'Servicios Financieros', palabrasClave: ['comision bancaria', 'manejo de cuenta', 'intereses', 'banco'] },
  { clave: '84131500', descripcion: 'Servicios de seguros de vida, gastos médicos y pólizas empresariales', categoria: 'Servicios Financieros', palabrasClave: ['seguros', 'poliza', 'gastos medicos', 'vida'] },
  { clave: '84131600', descripcion: 'Servicios de seguros de automóviles, flotillas y transporte', categoria: 'Servicios Financieros', palabrasClave: ['seguro de auto', 'poliza vehicular', 'cobertura amplia', 'flotilla'] },

  // ── 7. TRANSPORTE, FLETES, LOGÍSTICA Y MENSAJERÍA ──
  { clave: '78101800', descripcion: 'Servicios de transporte de carga por carretera o fletes terrestres', categoria: 'Logística y Fletes', palabrasClave: ['flete', 'transporte', 'envio', 'paqueteria', 'logistica', 'carga', 'camion'] },
  { clave: '78102200', descripcion: 'Servicios de mensajería, paquetería express y entregas locales', categoria: 'Logística y Fletes', palabrasClave: ['paqueteria', 'mensajeria', 'dhl', 'estafeta', 'fedex', 'envios'] },
  { clave: '78141500', descripcion: 'Servicios de almacenamiento, bodegaje y custodia de mercancías', categoria: 'Logística y Fletes', palabrasClave: ['almacen', 'bodega', 'almacenamiento', 'maniobras'] },
  { clave: '78101600', descripcion: 'Servicios de transporte de pasajeros por carretera (Taxis, Autobuses, Vanes)', categoria: 'Transporte', palabrasClave: ['transporte de personal', 'taxi', 'autobus', 'pasajeros', 'van'] },
  { clave: '78111800', descripcion: 'Servicios de transporte de pasajeros por ferrocarril o metro', categoria: 'Transporte', palabrasClave: ['tren', 'metro', 'ferrocarril'] },
  { clave: '78111500', descripcion: 'Servicios de transporte aéreo de pasajeros (Boletos de avión)', categoria: 'Transporte', palabrasClave: ['vuelo', 'boleto de avion', 'aerolinea', 'avion'] },
  { clave: '78181700', descripcion: 'Servicios de arrastre, remolque y grúas de vehículos', categoria: 'Automotriz y Taller', palabrasClave: ['grua', 'remolque', 'arrastre', 'corralon'] },
  { clave: '78111808', descripcion: 'Servicios de peaje y casetas de cobro en autopistas', categoria: 'Transporte', palabrasClave: ['peaje', 'caseta', 'tag', 'capufe', 'telepeaje'] },
  { clave: '78181502', descripcion: 'Servicios de estacionamiento público, pensiones y parquímetros', categoria: 'Transporte', palabrasClave: ['estacionamiento', 'pension', 'parquimetro', 'valet parking'] },
  { clave: '80141605', descripcion: 'Servicios de distribución y gestión de logística integral', categoria: 'Logística y Fletes', palabrasClave: ['distribucion', 'logistica', 'suministro'] },

  // ── 8. AUTOMOTRIZ, TALLERES, COMBUSTIBLES Y REFACCIONES ──
  { clave: '78181500', descripcion: 'Servicios de mantenimiento y reparación mecánica de vehículos', categoria: 'Automotriz y Taller', palabrasClave: ['mantenimiento', 'mecanica', 'servicio', 'reparacion', 'afinacion', 'frenos', 'taller'] },
  { clave: '78181501', descripcion: 'Servicios de hojalatería, pintura y enderezado automotriz', categoria: 'Automotriz y Taller', palabrasClave: ['hojalateria', 'pintura', 'golpes', 'carroceria', 'pulido'] },
  { clave: '78181503', descripcion: 'Servicios de lavado, engrasado y estética automotriz', categoria: 'Automotriz y Taller', palabrasClave: ['autolavado', 'car wash', 'lavado de motor', 'estetica automotriz'] },
  { clave: '78181505', descripcion: 'Servicios de alineación, balanceo y montaje de llantas', categoria: 'Automotriz y Taller', palabrasClave: ['alineacion', 'balanceo', 'vulcanizadora', 'montaje llantas'] },
  { clave: '25171500', descripcion: 'Piezas, refacciones y componentes para carrocerías de vehículos', categoria: 'Automotriz y Taller', palabrasClave: ['refacciones', 'partes', 'auto', 'camioneta', 'piezas', 'defensa', 'espejo'] },
  { clave: '25171700', descripcion: 'Sistemas de frenos automotrices (Balatas, Discos, Tambores)', categoria: 'Automotriz y Taller', palabrasClave: ['balatas', 'discos de freno', 'liquido de frenos', 'calipers'] },
  { clave: '25172400', descripcion: 'Amortiguadores, resortes y piezas de suspensión vehicular', categoria: 'Automotriz y Taller', palabrasClave: ['amortiguadores', 'suspension', 'rotulas', 'bujes', 'horquillas'] },
  { clave: '25172500', descripcion: 'Llantas y neumáticos para automóviles, camionetas y camiones', categoria: 'Automotriz y Taller', palabrasClave: ['llantas', 'neumaticos', 'rin', 'camara'] },
  { clave: '26111707', descripcion: 'Baterías y acumuladores automotrices de 12V y 24V', categoria: 'Baterías y Energía', palabrasClave: ['bateria auto', 'acumulador', 'gonher', 'lth', 'america'] },
  { clave: '15121500', descripcion: 'Aceites lubricantes, fluidos para motor y grasas automotrices', categoria: 'Automotriz y Taller', palabrasClave: ['aceite de motor', 'lubricante', 'aceite sintetico', 'grasa', 'antifreeze', 'anticongelante'] },
  { clave: '15101506', descripcion: 'Gasolina regular / Magna (Combustible para vehículos)', categoria: 'Combustibles', palabrasClave: ['gasolina', 'magna', 'regular', 'combustible', 'gasolinera'] },
  { clave: '15101505', descripcion: 'Gasolina premium (Combustible de alto octanaje)', categoria: 'Combustibles', palabrasClave: ['gasolina premium', 'roja', 'alto octanaje'] },
  { clave: '15101505', descripcion: 'Diésel (Combustible para camiones y vehículos pesados)', categoria: 'Combustibles', palabrasClave: ['diesel', 'combustible pesado', 'trailer'] },
  { clave: '15111500', descripcion: 'Gas licuado de petróleo (Gas LP carburación y doméstico)', categoria: 'Combustibles', palabrasClave: ['gas lp', 'tanque de gas', 'gas carburacion'] },
  { clave: '25101500', descripcion: 'Vehículos de motor para transporte de personas (Autos y camionetas)', categoria: 'Vehículos', palabrasClave: ['compra de auto', 'vehiculo', 'camioneta', 'sedan', 'pickup'] },
  { clave: '25101600', descripcion: 'Vehículos de carga y camiones comerciales', categoria: 'Vehículos', palabrasClave: ['camion de carga', 'trailer', 'chasis', 'plataforma'] },
  { clave: '78111802', descripcion: 'Servicios de renta y arrendamiento de automóviles y camionetas', categoria: 'Transporte', palabrasClave: ['renta de auto', 'arrendamiento vehicular', 'leasing'] },

  // ── 9. CONSTRUCCIÓN, MANTENIMIENTO DE INMUEBLES Y MATERIALES ──
  { clave: '72101500', descripcion: 'Servicios de mantenimiento y reparación de edificios, bodegas u oficinas', categoria: 'Mantenimiento General', palabrasClave: ['mantenimiento oficina', 'reparacion inmueble', 'plomeria', 'electricidad', 'pintura'] },
  { clave: '72102900', descripcion: 'Servicios de mantenimiento y reparación de sistemas de aire acondicionado (HVAC)', categoria: 'Mantenimiento General', palabrasClave: ['aire acondicionado', 'clima', 'minisplit', 'refrigeracion', 'hvac'] },
  { clave: '72154000', descripcion: 'Servicios de herrería, soldadura y estructuras metálicas', categoria: 'Mantenimiento General', palabrasClave: ['herreria', 'soldadura', 'puertas de metal', 'rejas', 'techumbres'] },
  { clave: '72151900', descripcion: 'Servicios de albañilería, acabados y colocación de pisos y azulejos', categoria: 'Construcción', palabrasClave: ['albanileria', 'pisos', 'azulejo', 'tablaroca', 'yeso'] },
  { clave: '72151300', descripcion: 'Servicios de pintura interior, exterior y recubrimientos', categoria: 'Mantenimiento General', palabrasClave: ['pintura', 'pintor', 'impermeabilizante', 'esmalte'] },
  { clave: '72153100', descripcion: 'Servicios de impermeabilización de techos y lozas', categoria: 'Construcción', palabrasClave: ['impermeabilizacion', 'techos', 'loza', 'goteras'] },
  { clave: '30111500', descripcion: 'Cemento, cal, mortero y agregados de construcción', categoria: 'Materiales Construcción', palabrasClave: ['cemento', 'cal', 'mortero', 'arena', 'grava'] },
  { clave: '30121700', descripcion: 'Varilla corrugada, alambrón y aceros de refuerzo', categoria: 'Materiales Construcción', palabrasClave: ['varilla', 'acero', 'alambron', 'malla electrosoldada'] },
  { clave: '31211500', descripcion: 'Pinturas vinílicas, esmaltes y selladores arquitectónicos', categoria: 'Materiales Construcción', palabrasClave: ['pintura comex', 'esmalte', 'sellador', 'brocha', 'rodillo'] },
  { clave: '27111500', descripcion: 'Herramientas de mano (Desarmadores, Pinzas, Llaves, Martillos)', categoria: 'Herramientas', palabrasClave: ['desarmador', 'pinzas', 'llave española', 'martillo', 'perico'] },
  { clave: '27112700', descripcion: 'Herramientas eléctricas (Taladros, Esmeriles, Caladoras, Pulidoras)', categoria: 'Herramientas', palabrasClave: ['taladro', 'rotomartillo', 'esmeril', 'pulidora', 'atornillador'] },
  { clave: '31161500', descripcion: 'Tornillería, pijas, taquetes, tuercas y arandelas', categoria: 'Ferretería', palabrasClave: ['tornillos', 'pijas', 'taquetes', 'tuercas', 'arandelas', 'remaches'] },
  { clave: '31201500', descripcion: 'Cintas adhesivas, cinta de aislar, teflón y pegamentos industriales', categoria: 'Ferretería', palabrasClave: ['cinta de aislar', 'teflon', 'cinta canela', 'silicon', 'pegamento'] },

  // ── 10. ARTÍCULOS DE OFICINA, PAPELERÍA, LIMPIEZA Y EPP ──
  { clave: '14111500', descripcion: 'Papel para fotocopia, impresión y papelería para oficina', categoria: 'Papelería y Oficina', palabrasClave: ['papel bond', 'hojas blancas', 'resma', 'papel carta'] },
  { clave: '44121700', descripcion: 'Plumas, lápices, marcadores y correctores', categoria: 'Papelería y Oficina', palabrasClave: ['plumas', 'boligrafos', 'lapiz', 'plumon', 'marca textos'] },
  { clave: '44122000', descripcion: 'Carpetas, folders, sobres y organizadores de documentos', categoria: 'Papelería y Oficina', palabrasClave: ['carpetas', 'folders', 'sobres', 'archivadores'] },
  { clave: '44122100', descripcion: 'Grapas, clips, engrapadoras y perforadoras de papel', categoria: 'Papelería y Oficina', palabrasClave: ['grapas', 'engrapadora', 'clips', 'perforadora'] },
  { clave: '47131800', descripcion: 'Soluciones y productos de limpieza (Detergentes, Cloro, Desinfectantes)', categoria: 'Limpieza y Consumibles', palabrasClave: ['cloro', 'fabuoso', 'detergente', 'desinfectante', 'jabon'] },
  { clave: '47131500', descripcion: 'Artículos y utensilios para limpieza (Escobas, Trapeadores, Franelas, Bolsas)', categoria: 'Limpieza y Consumibles', palabrasClave: ['escoba', 'trapeador', 'bolsa de basura', 'franela', 'recogedor'] },
  { clave: '14111700', descripcion: 'Papel higiénico, servilletas y toallas de papel para manos', categoria: 'Limpieza y Consumibles', palabrasClave: ['papel de bano', 'papel higienico', 'servitoallas', 'servilletas'] },
  { clave: '46181500', descripcion: 'Prendas y equipo de protección personal (Chalecos, Cascos, Guantes, Botas)', categoria: 'Seguridad y Video', palabrasClave: ['epp', 'chaleco reflejante', 'seguridad industrial', 'casco', 'guantes', 'botas casquillo'] },
  { clave: '46181800', descripcion: 'Protección para ojos y cara (Lentes de seguridad, Caretas, Cubrebocas)', categoria: 'Seguridad y Video', palabrasClave: ['lentes de seguridad', 'goggles', 'cubrebocas', 'mascarilla'] },
  { clave: '56101700', descripcion: 'Mobiliario de oficina (Escritorios, Sillas ejecutivas, Archiveros, Mesas)', categoria: 'Mobiliario y Oficina', palabrasClave: ['silla de oficina', 'escritorio', 'mesa de juntas', 'archivero metalico'] },

  // ── 11. ALIMENTOS, RESTAURANTES, HOTELES Y VIÁTICOS ──
  { clave: '90101500', descripcion: 'Servicios de restaurantes, cafeterías y establecimientos de comida preparada', categoria: 'Alimentos y Viáticos', palabrasClave: ['restaurante', 'comida', 'consumo alimentos', 'desayuno', 'cena', 'comedor'] },
  { clave: '90101800', descripcion: 'Servicios de comida rápida, taquerías y autoservicio', categoria: 'Alimentos y Viáticos', palabrasClave: ['comida rapida', 'taqueria', 'cafeteria', 'snacks'] },
  { clave: '90111500', descripcion: 'Servicios de hospedaje en hoteles, moteles y posadas (Viáticos)', categoria: 'Alimentos y Viáticos', palabrasClave: ['hotel', 'hospedaje', 'habitacion', 'alojamiento', 'motel'] },
  { clave: '90101600', descripcion: 'Servicios de banquetes, catering y eventos sociales o empresariales', categoria: 'Alimentos y Viáticos', palabrasClave: ['catering', 'banquetes', 'coffee break', 'bocadillos'] },
  { clave: '50202300', descripcion: 'Bebidas no alcohólicas, agua embotellada, refrescos y café', categoria: 'Alimentos y Viáticos', palabrasClave: ['garrafon de agua', 'botella de agua', 'cafe', 'refrescos'] },
  { clave: '50192700', descripcion: 'Alimentos preparados para llevar y empacados', categoria: 'Alimentos y Viáticos', palabrasClave: ['alimentos empaquetados', 'lunch', 'box lunch'] },

  // ── 12. SALUD, MÉDICOS Y FARMACÉUTICOS ──
  { clave: '85121600', descripcion: 'Servicios de medicina general, consultas médicas y salud laboral', categoria: 'Servicios de Salud', palabrasClave: ['consulta medica', 'medico', 'examen de ingreso', 'antidoping'] },
  { clave: '85121800', descripcion: 'Servicios de laboratorios clínicos y análisis médicos', categoria: 'Servicios de Salud', palabrasClave: ['analisis clinicos', 'laboratorio', 'prueba de sangre'] },
  { clave: '51101500', descripcion: 'Medicamentos y productos farmacéuticos de patente o genéricos', categoria: 'Servicios de Salud', palabrasClave: ['medicamento', 'farmacia', 'pastillas', 'jarabe', 'analgesico'] },
  { clave: '42172000', descripcion: 'Botiquines de primeros auxilios y material de curación', categoria: 'Servicios de Salud', palabrasClave: ['botiquin', 'alcohol', 'gasas', 'vendas', 'curitas'] },

  // ── 13. CLAVES GENÉRICAS Y DIVERSOS SAT ──
  { clave: '01010101', descripcion: 'No existe en el catálogo (Clave Genérica SAT por defecto)', categoria: 'Genérico SAT', palabrasClave: ['generico', 'no existe', 'otros', '01010101', 'sin clasificar'] },
  { clave: '80131500', descripcion: 'Servicios de arrendamiento o alquiler de bienes inmuebles comerciales (Oficinas/Bodegas)', categoria: 'Arrendamiento', palabrasClave: ['renta de oficina', 'renta de bodega', 'arrendamiento local'] },
  { clave: '80131800', descripcion: 'Servicios de corretaje y gestión inmobiliaria', categoria: 'Arrendamiento', palabrasClave: ['inmobiliaria', 'comision renta', 'bienes raices'] },
  { clave: '81141600', descripcion: 'Servicios de manufactura y maquila sobre pedido', categoria: 'Servicios Profesionales', palabrasClave: ['maquila', 'manufactura', 'ensamble'] },
  { clave: '82121500', descripcion: 'Servicios de impresión offset, serigrafía, lonas y litografía', categoria: 'Servicios Profesionales', palabrasClave: ['imprenta', 'lonas', 'serigrafia', 'vinil', 'rotulacion'] },
  { clave: '76111500', descripcion: 'Servicios de limpieza general de oficinas y edificios comerciales', categoria: 'Limpieza y Consumibles', palabrasClave: ['servicio de limpieza', 'aseo', 'limpieza corporativa'] },
  { clave: '72102100', descripcion: 'Servicios de control de plagas y fumigación de inmuebles', categoria: 'Mantenimiento General', palabrasClave: ['fumigacion', 'control de plagas', 'desratizacion'] },
  { clave: '83101500', descripcion: 'Servicios de suministro de energía eléctrica (CFE)', categoria: 'Servicios Públicos', palabrasClave: ['luz', 'cfe', 'recibo de luz', 'energia electrica'] },
  { clave: '83101600', descripcion: 'Servicios de suministro de agua potable y alcantarillado', categoria: 'Servicios Públicos', palabrasClave: ['agua potable', 'jmas', 'recibo de agua'] },
  { clave: '83111500', descripcion: 'Servicios de telefonía fija e internet de banda ancha (Telmex, Totalplay, Izzi)', categoria: 'Servicios Telecom', palabrasClave: ['internet', 'telmex', 'totalplay', 'izzi', 'telefono fijo'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE UNIDADES DE MEDIDA DEL SAT (c_ClaveUnidad)
// ─────────────────────────────────────────────────────────────────────────────
export const SAT_UNIDADES: SatClaveUnidad[] = [
  { clave: 'H87', nombre: 'Pieza', descripcion: 'Unidad de artículo o pieza individual', simbolo: 'pza' },
  { clave: 'E48', nombre: 'Unidad de servicio', descripcion: 'Prestación de servicios profesionales, instalaciones o soporte', simbolo: 'serv' },
  { clave: 'EA', nombre: 'Elemento (Each)', descripcion: 'Cada uno / Pieza unitaria', simbolo: 'ea' },
  { clave: 'ACT', nombre: 'Actividad', descripcion: 'Actividad realizada o jornada laboral', simbolo: 'act' },
  { clave: 'KGM', nombre: 'Kilogramo', descripcion: 'Unidad de masa en kilogramos', simbolo: 'kg' },
  { clave: 'GRM', nombre: 'Gramo', descripcion: 'Unidad de masa en gramos', simbolo: 'g' },
  { clave: 'TNE', nombre: 'Tonelada métrica', descripcion: 'Unidad de masa equivalente a 1000 kg', simbolo: 'ton' },
  { clave: 'MTR', nombre: 'Metro', descripcion: 'Unidad de longitud lineal', simbolo: 'm' },
  { clave: 'CMT', nombre: 'Centímetro', descripcion: 'Unidad de longitud', simbolo: 'cm' },
  { clave: 'KMT', nombre: 'Kilómetro', descripcion: 'Unidad de distancia en kilómetros', simbolo: 'km' },
  { clave: 'MTK', nombre: 'Metro cuadrado', descripcion: 'Unidad de superficie o área', simbolo: 'm²' },
  { clave: 'MTQ', nombre: 'Metro cúbico', descripcion: 'Unidad de volumen', simbolo: 'm³' },
  { clave: 'LTR', nombre: 'Litro', descripcion: 'Unidad de volumen líquido (Gasolina, aceites)', simbolo: 'L' },
  { clave: 'MLT', nombre: 'Mililitro', descripcion: 'Unidad de volumen líquido', simbolo: 'ml' },
  { clave: 'GLI', nombre: 'Galón (UK / US)', descripcion: 'Unidad de volumen de líquido', simbolo: 'gal' },
  { clave: 'SET', nombre: 'Conjunto / Juego', descripcion: 'Kit o conjunto de artículos', simbolo: 'jgo' },
  { clave: 'XBX', nombre: 'Caja', descripcion: 'Empaque en caja de cartón o plástico', simbolo: 'caja' },
  { clave: 'XPK', nombre: 'Paquete', descripcion: 'Empaque en paquete o bulto', simbolo: 'paq' },
  { clave: 'BG', nombre: 'Bolsa', descripcion: 'Empaque en bolsa', simbolo: 'bolsa' },
  { clave: 'RO', nombre: 'Rollo', descripcion: 'Empaque en rollo (Cable, cinta)', simbolo: 'rollo' },
  { clave: 'DZN', nombre: 'Docena', descripcion: 'Conjunto de 12 unidades', simbolo: 'doc' },
  { clave: 'PR', nombre: 'Par', descripcion: 'Conjunto de dos elementos (Guantes, botas)', simbolo: 'par' },
  { clave: 'DAY', nombre: 'Día', descripcion: 'Unidad de tiempo por día trabajado o rentado', simbolo: 'día' },
  { clave: 'HUR', nombre: 'Hora', descripcion: 'Unidad de tiempo por hora de servicio', simbolo: 'hr' },
  { clave: 'MON', nombre: 'Mes', descripcion: 'Suscripción o renta mensual', simbolo: 'mes' },
  { clave: 'ANN', nombre: 'Año', descripcion: 'Suscripción o póliza anual', simbolo: 'año' },
  { clave: 'E51', nombre: 'Trabajo / Proyecto', descripcion: 'Trabajo concluido por proyecto', simbolo: 'trab' },
  { clave: 'P1', nombre: 'Porcentaje', descripcion: 'Comisiones o porcentajes pactados', simbolo: '%' },
  { clave: 'XUN', nombre: 'Unidad', descripcion: 'Unidad genérica', simbolo: 'unid' },
  { clave: 'ZZ', nombre: 'Mutuamente definido', descripcion: 'Unidad definida por acuerdo entre partes', simbolo: 'mutuo' },
];

/**
 * Filtra el catálogo de productos y servicios por número de clave o texto de descripción.
 */
export function buscarClavesSat(query: string, limit = 50): SatClaveProdServ[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return SAT_PRODUCTOS_SERVICIOS.slice(0, limit);

  const directCodeMatches: SatClaveProdServ[] = [];
  const descriptionMatches: SatClaveProdServ[] = [];

  for (const item of SAT_PRODUCTOS_SERVICIOS) {
    if (item.clave.includes(q)) {
      directCodeMatches.push(item);
    } else if (
      item.descripcion.toLowerCase().includes(q) ||
      (item.categoria && item.categoria.toLowerCase().includes(q)) ||
      (item.palabrasClave && item.palabrasClave.some(p => p.toLowerCase().includes(q)))
    ) {
      descriptionMatches.push(item);
    }
  }

  return [...directCodeMatches, ...descriptionMatches].slice(0, limit);
}

/**
 * Filtra el catálogo de unidades del SAT por clave o descripción.
 */
export function buscarUnidadesSat(query: string, limit = 50): SatClaveUnidad[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return SAT_UNIDADES.slice(0, limit);

  return SAT_UNIDADES.filter(item => {
    if (item.clave.toLowerCase().includes(q)) return true;
    if (item.nombre.toLowerCase().includes(q)) return true;
    if (item.descripcion && item.descripcion.toLowerCase().includes(q)) return true;
    if (item.simbolo && item.simbolo.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, limit);
}

/**
 * Obtiene la descripción amigable de una clave de producto/servicio SAT
 */
export function obtenerDescripcionClaveSat(clave: string): string {
  const item = SAT_PRODUCTOS_SERVICIOS.find(c => c.clave === (clave || '').trim());
  return item ? item.descripcion : clave;
}

/**
 * Obtiene la descripción amigable de una clave de unidad SAT
 */
export function obtenerNombreUnidadSat(clave: string): string {
  const item = SAT_UNIDADES.find(u => u.clave.toUpperCase() === (clave || '').trim().toUpperCase());
  return item ? `${item.clave} - ${item.nombre}` : clave;
}
