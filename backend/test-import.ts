import fs from 'fs';
import path from 'path';

async function testImport() {
  const csvContent = `Código,Nombre,Categoría,Descripción,Numero de serie / Modelo,Estado,Activo
H-1,Multimetro Steren,Eléctrica,Faltan Puntas,P046846,Incompleto,SI
H-2,Multimetro Truper,Eléctrica,Completo,MUT-105,Bueno,SI
H-3,Pinzas para terminal Ponchable,Eléctrica,Completo,HCS8 6-4A,Bueno,SI
H-4,Pinzas para terminal Ponchable,Eléctrica,Falta Limpieza,HCS8 6-4A,Medio,SI
H-5,Pinzas para terminal Ponchable,Eléctrica,Completo,HCS8 6-4A,Bueno,SI
H-6,Pinzas ponchable MC4,Eléctrica,Completo ,LY-2546B,Bueno,SI
H-7,Pinzas ponchable MC4,Eléctrica,Completo,LY-2546B,Bueno,SI
H-8,Pinzas ponchable MC4 Azul,Eléctrica,Completo,Genérica,Bueno,SI
H-9,Pinza corte fino Millwaukee,Manual,Completo,48-22-6105,Bueno,SI
H-10,Pinza corte fino Millwaukee,Manual,Completo,48-22-6105,Bueno,SI
H-11,Pinza corte fino Steren,Manual,Completo,N/A,Bueno,SI
H-12,Pinzas Perras,Manual,Completo,48-22-3407,Bueno,SI
H-13,Desarmador Millwaukee Multipuntas,Manual,Faltan Puntas,N/A,Incompleto,SI
H-14,Desarmador Millwaukee Multipuntas,Manual,Faltan Puntas,N/A,Incompleto,SI
H-15,Desarmador Total Multipuntas,Manual,Faltan Puntas,N/A,Incompleto,SI
H-16,Tester de corriente GB,Eléctrica,Completo,N/A,Bueno,SI
H-17,Tester de corriente Generico,Eléctrica,Completo,N/A,Bueno,SI
H-18,Nivel de mano pequeño,General,Completo,N/A,Bueno,SI
H-19,Nivel de mano pequeño,General,Completo,N/A,Bueno,SI
H-20,Nivel de mano pequeño,General,Completo,N/A,Bueno,SI
H-21,Nivel de mano pequeño,General,Completo,N/A,Bueno,SI
H-22,Corta Machuelo,General,Completo,N/A,Bueno,SI
H-23,Corta Machuelo,General,Completo,N/A,Bueno,SI
H-24,Corta Machuelo,General,Completo,N/A,Bueno,SI
H-25,Corta Machuelo,General,Completo,N/A,Bueno,SI
H-26,Martillo,General,Completo,N/A,Bueno,SI
H-27,Broca Trupper SDS 5/16 X 12,General,Completo,N/A,Bueno,SI
H-28,Punta Cincel SDS plus generica,General,Completo,N/A,Bueno,SI
H-29,Desarmador Cruz,General,Completo,N/A,Bueno,SI
H-30,Desarmador Cruz,General,Completo,N/A,Bueno,SI
H-31,Desarmador Cruz,General,Completo,N/A,Bueno,SI
H-32,Tester de cable de red Klen Tool,General,Completo,N/A,Bueno,SI
H-33,Testeador de cable Master NS,General,Completo,NS-468,Bueno,SI
H-34,Sierra Manual para tablaroca,Corte,Completo,N/A,Bueno,SI
H-35,Pulidora Milwaukee,Corte,Faltan Guarda,N/A,Incompleto,SI
H-36,Pila M18 5.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-37,Pila M18 5.0 Millwaukee,Eléctrica,No carga,N/A,MALO,SI
H-38,Pila M12 4.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-39,Pila M12 4.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-40,Pila M18 1.5 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-41,Pila M18 1.5 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-42,Pila M18 1.5 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-43,Pila M18 2.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-44,Cargador Milwaukee M12,Eléctrica,Completo,N/A,Bueno,SI
H-45,Cargador Milwaukee M12,Eléctrica,No carga,N/A,Malo,SI
H-46,Guia Surtek 15M,General,Se desconoce  la medida,N/A,Medio,SI
H-47,Guia Trupper 15M,General,Completo,N/A,Bueno,SI
H-48,Pila M12 2.0 Millwaukee,Eléctrica,No carga,N/A,Malo,SI
H-49,Taladro Rotomartillo Mandril Milwaukee ,General,Completo,C50AD242700231,Bueno,SI
H-50,Pinzas ponchable MC4,Eléctrica,Completo ,LY-2546B,Bueno,SI
H-51,Pinzas desforradoras,Eléctrica,Completo,Genérica,Bueno,SI
H-52,Rotomartillo Milwaukee de mandril,General,Completo,B01W203500166,Bueno,SI
H-53,Broca de mandril de 1x6,General,Completo,N/A,Bueno,SI
H-54,Broca de mandril de 1x12,General,Completo,N/A,Bueno,SI
H-55,Rotomartillo M12 Milwaukee,General,Cargador y kit completo,F11AD202000646,Bueno,SI
H-56,Rotomartillo Milwaukee SDS Plus,General,completo,G48BD202204308,Bueno,SI
H-57,Broca 7/8x12 SDS Plus,General,Completo,N/A,Bueno,SI
H-58,Punta Cincel SDS plus generica,General,Completo,N/A,Bueno,SI
H-59,Broca 3/8x6 SDS Plus,General,Completo,N/A,Bueno,SI
H-60,Broca 3/8x6 Mandril,General,Completo,N/A,Bueno,SI
H-61,Rotomartillo M18,General,"KIT INCOMPLETO le falta cargador, taladro de impacto con su pila , Y SE LE ASIGNA UNA m18 2.0. Esta en mal estado",J77AD192919528,Incompleto,SI
H-62,Guia de cable Klein Tools,General,Se desconoce  la medida,N/A,Bueno,SI
H-63,Cargador Milwaukee M12,Eléctrica,Completo,N/A,Bueno,SI
H-64,Cargador Milwaukee M12,Eléctrica,Completo,N/A,Bueno,SI
H-65,Cortadora M18 Milwaukee,Corte,"Falta cargador, 1 navaja nueva, 1 usada y si tiene pila M18 2.0",F39DD171400619,Incompleto,SI
H-66,Rotomartillo Milwaukee SDS Plus,General,Completo,G43DD211804337,Bueno,SI
H-67,Broca SDS MAX 3/4x36 ,General,Completo,N/A,Bueno,SI
H-68,Termofusora Latin Tool,General,Completo,N/A,Bueno,SI
H-69,Pulidora Dreamer-South -Max,General,Completo,F0130AB,Bueno,SI
H-70,Juego Sacobocado Milwaukee,General,Le falta broca y piezas,N/A,Incompleto,SI
H-71,Taladro Makita,General,No funciona,N/A,Malo,SI
H-72,Pistola de calor Makita,General,Completo,N/A,Bueno,SI
H-73,Caladora Makita,General,Completo,37429,Bueno,SI
H-74,Taladro DeWalt,General,2 pillas y un cargador,0144ES,Bueno,SI
H-75,Juego de dados y llaves Work Force,General,"Faltan dados , rash y un par de llaves",N/A,Incompleto,SI
H-76,Sierra Milwaukee M18,General,Falta Pila y cargador,F83DB192903215,Incompleto,SI
H-77,Pistola Hilti DX460,General,Completo,994472,Bueno,SI
H-78,Pulidora Inalambrica Milwaukee,General,Esta la caja mas no la pulidora,N/A,Faltante,SI
H-79,Sierra para madera DeWalt,General,Completo,N/A,Bueno,SI
H-80,Router  de Madera Millwaukee,General,Completo,N/A,Bueno,SI
H-81,Esmeriladora Milwaukee,General,Completo,N/A,Bueno,SI
H-82,Rotomartillo M12 Milwaukee,General,Con pila,N/A,Bueno,SI
H-83,Rotomartillo M18 Milwaukee,General,Falta Pila ,N/A,Bueno,SI
H-84,Rotomartillo Milwaukee SDS Plus,General,No sirve ,N/A,Malo,SI
H-85,Pulidor pre tool,General,Completo,N/A,Bueno,SI
H-86,Tester de cable ,General,Completo,N/A,Bueno,SI
H-87,Lijadora Makita,General,Completo,N/A,Bueno,SI
H-88,Ponchador Hikvision,General,Completo,N/A,Bueno,SI
H-89,Tester de corriente GB,General,Completo,N/A,Bueno,SI
H-90,Multimetro Steren,Eléctrica,Completo,P046846,Bueno,SI
H-91,Multímetro Steren,Eléctrica,Completo,P046846,Bueno,SI
H-92,Guía para cable Adir,General,Completo,1488,Bueno,SI
H-93,Guía para cable Milwaukee,General,Completo,48-22-4172,Bueno,SI
H-94,Pinzas ponchable RJ45 Verde,Eléctrica,Completo,Genérica,Bueno,SI
H-95,Pinzas ponchable RJ45 Steren,Eléctrica,Completo,N/A,Bueno,SI
H-96,Pinzas ponchable Forcond,Eléctrica,Completo,8P8C,Bueno,SI
H-97,Pinzas desforradoras,Eléctrica,Completo,Genérica,Bueno,SI
H-98,Pinzass desforradoras Milwaukee,Eléctrica,Completo,48-22-3052,Bueno,SI
H-99,Pinzas de corte Milwaukee,Manual,Completo,N/A,Bueno,SI
H-100,Pinzas de corte,Manual,Completo,Genérica,Bueno,SI
H-101,Cinta Milwaukee Magnética 5M,Medicion,Completo,48-22-0716,Bueno,SI
H-102,Cinta Milwaukee Magnética 5M,Medicion,Completo,48-22-0716,Bueno,SI
H-103,Cinta Milwaukee 5M,Medicion,Completo,N/A,Bueno,SI
H-104,Cinta Milwaukee 5M,Medicion,Completo,N/A,Bueno,SI
H-105,Juego de llaves Allen Milwaukee Estándar,General,Completo,48-22-2181,Bueno,SI
H-106,Juego de llaves Allen Stanley Milimétrico,General,Completo,N/A,Bueno,SI
H-107,Detector de voltaje Milwaukee,Eléctrica,Completo,2202-20,Bueno,SI
H-108,Detector de voltaje Fluke,Eléctrica,Completo,6920,Bueno,SI
H-109,Rach Manual Pequeño,General,Completo,N/A,Bueno,SI
H-110,Accesorio Mandril para SDS,General,Completo,N/A,Bueno,SI
H-111,Cautin Steren,General,Completo,N/A,Bueno,SI
H-112,Cautin Steren,General,Completo,N/A,Bueno,SI
H-113,Cautin Steren,General,Completo,N/A,Bueno,SI
H-114,Cautin Steren,General,Completo,N/A,Bueno,SI
H-115,Cautin Steren,General,Completo,N/A,Bueno,SI
H-116,Remachadora Pretul,General,Completo,N/A,Bueno,SI
H-117,Broca SDS Milwaukee 1/2 X 6 1/2,General,Completo,N/A,Bueno,SI
H-118,Desarmador paleta,General,Completo,N/A,Bueno,SI
H-119,Desarmador paleta,General,Completo,N/A,Bueno,SI
H-120,Desarmador paleta,General,Completo,N/A,Bueno,SI
H-121,Desarmador paleta,General,Completo,N/A,Bueno,SI
H-122,Testeador de cable White Tracker,General,Completo,N/A,Bueno,SI
H-123,Láser de distancia,Medicion,Completo,N/A,Bueno,SI
H-124,Marro,General,Completo,N/A,Bueno,SI
H-125,Taladro Impacto M12 Milwaukee,General,Completo,F05AD202000647,Bueno,SI
H-126,Cortadora Milwaukee,Corte,Completo,C73AD190802168,Bueno,SI
H-127,Taladro Impacto M18 Milwaukee,General,Completo,N/A,Bueno,SI
H-128,Rotomartillo M18 Milwaukee,General,Completo,J77AF3016331,Medio,SI
H-129,Kit Manómetro,General,Completo,ZC352,Bueno,SI
H-130,Sopladora XPOWER,General,Completo,A-2,Bueno,SI
H-131,Bomba de vacío THORL,General,Completo,VP135,Bueno,SI
H-132,Pulidora Milwaukee,General,Completo,N/A,Bueno,SI
H-133,Marro,General,Completo,N/A,Bueno,SI
H-134,Guía para cable 30 M Truper,General,Completo,N/A,Bueno,SI
H-135,LLaves Allen Stanley,General,Completo,N/A,Bueno,SI
H-136,LLaves Allen Surtek Torx,General,Completo,ALLFTL7,Bueno,SI
H-137,Llaves Allen Milwaukee,General,Completo,48-22-2181,Bueno,SI
H-138,Llaves Allen,General,Completo,N/A,Bueno,SI
H-139,Llaves Allen,General,Completo,N/A,Bueno,SI
H-140,Llaves Allen Husky,General,Completo,N/A,Bueno,SI
H-141,Porta Machuelo Surtek,General,Completo,N/A,Bueno,SI
H-142,Porta Machuelo Truper,General,Completo,N/A,Bueno,SI
H-143,Rotomartillo Milwaukee SDS Plus Inalámbrico,General,Completo,L85BR233603095,Bueno,SI
H-144,Taladro Impacto Milwaukee,General,Completo,J57AF203013194,Bueno,SI
H-145,Taladro Milwaukee,General,Completo,M64AD222001311,Bueno,SI
H-146,Pila M18 5.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-147,Pila M18 5.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-148,Pila M18 5.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-149,Pila M18 5.0 Millwaukee,Eléctrica,Completo,N/A,Bueno,SI
H-150,Cargador Milwaukee M12,Eléctrica,Completo,D63C9170893951G,Bueno,SI
H-151,Kit Desatornilladores Steren,General,Completo,HER-162,Bueno,SI
H-152,Llave inglesa 200mm,General,Completo,N/A,Bueno,SI
H-153,Pinzas de corte PRETUL,Manual,Completo,N/A,Bueno,SI
H-154,Caja Llaves Allen,General,Completo,N/A,Bueno,SI
H-155,Rotomartillo Milwaukee SDS Max,General,Completo,C84AD191500069,Bueno,SI
H-156,Pila M12,Eléctrica,Completo,N/A,Bueno,SI
H-157,Cargador Milwaukee M12,Eléctrica,Completo,N/A,Bueno,SI
H-158,Guía para cable 15 M,General,Completo,N/A,Bueno,SI
H-159,multimetro  steren ,Eléctrica,faltsn cables,PO 45820,malo,SI
H-160,Taladro M18 Milwaukee,General,Completo,N/A,Bueno,SI
H-161,pinzas electrica ,General,Completo,N/A,Bueno,SI
H-162,Pinzas Ponchadoras,General,Completo,N/A,Bueno,SI
H-163,Pila M18 Milwaukee,General,Completo,N/A,Bueno,SI
H-164,Tester Milwaukee,General,Completo,N/A,Bueno,SI
H-165,Pila M18 Milwaukee,General,Completo,N/A,Bueno,SI
H-166,nivel de mano husky ,General,Completo,N/A,Bueno,SI
H-167,Pinzas electricas Milwaukee,General,Completo,N/A,Bueno,SI
H-168,Pinza cortadora de cable Milwaukeee,General,Completo,N/A,Bueno,SI
H-169,Pinzas electricas Milwaukee,General,Completo,N/A,Bueno,SI
H-170,Pinzas electricas Milwaukee,General,Completo,N/A,Bueno,SI
H-171,Pinza Perica Milwaukee,General,Completo,N/A,Bueno,SI
H-172,Pinza Perica Milwaukee,General,Completo,N/A,Bueno,SI
H-173,Pinzas de punta Milwaukee,General,Completo,N/A,Bueno,SI
H-174,Pinzas de punta Milwaukee,General,Completo,N/A,Bueno,SI
H-175,Pinzas Perras Milwaukee,General,Completo,N/A,Bueno,SI
H-176,Pinza pela cables Milwaukee,General,Completo,N/A,Bueno,SI
H-177,Pinza pela cables Milwaukee,General,Completo,N/A,Bueno,SI
H-178,Pinzas electricas Milwaukee,General,Completo,N/A,Bueno,SI
H-179,"Llave inglesa 8""-200m",General,Completo,N/A,Bueno,SI
H-180,Dobla tubos ,General,Completo,N/A,Bueno,SI
H-181,Cortadora Milwaukee,General,Completo,N/A,Bueno,SI
H-182,Pulidora Milwaukee,General,Completo,N/A,Bueno,SI
H-183,Kit Fusionadora Fibra Óptica Optronix,Red,Completo,BBA906675,Bueno,SI
H-184,Panduit Opticam,Red,Completo,D17211WT020190,Bueno,SI
H-185,Kit Tester Cable Red Fluke Networks,Red,Completo,2712805,Bueno,SI
H-186,Etiquetadora Panduit,General,Completo,XA9L2300205 (MP75),Bueno,SI
H-187,Etiquetadora Panduit,General,Completo,MP200,Bueno,SI
H-188,Etiquetadora Panduit,General,Completo,PanTher LS8E,Bueno,SI
H-189,Pistola de clavos Ramset,General,Completo,41108583,Bueno,SI
H-190,Pistola de clavos Ramset,General,Completo,50505511,Bueno,SI
H-191,Pistola de clavos Ramset,General,Completo,50505503,Bueno,SI
H-192,Kit de Terminales,General,Completo,HSC8 64-A,Bueno,SI
H-193,Tester Fibra Óptica Linkedpro,Red,Completo,250214547,Bueno,SI
H-194,Tester Fibra Óptica Linkedpro,Red,Completo,250214238,Bueno,SI
H-195,Aspiradora 60 L Ridgid,General,Completo,N/A,Bueno,SI
H-196,Aspiradora M18,General,Completo,N/A,Bueno,SI
H-197,Aspiradora M18 Fuel Nueva en caja ,General,Completo,N/A,Bueno,SI
H-198,Manómetro Digital Elitech,Medicion,Completo,LMG10,Bueno,SI
H-199,Tester de cámara Epcom,Red,Completo,20220I1026139573,Bueno,SI
H-200,Ponchadora de Terminales Profesional,General,Completo,EIEZ80257,Bueno,SI
H-201,Ponchadora de Terminales Profesional,General,Completo,EIEZ80258,Bueno,SI
H-202,Multímetro,Eléctrica,Completo,DT9205A,Bueno,SI
H-203,Cautin Patent Azul,General,Completo,N/A,Bueno,SI
H-204,Portaherramientas Stanley,General,Completo,N/A,Bueno,SI
H-205,Kit Tester de corriente Tempo,Eléctrica,Completo,200EPG,Bueno,SI
H-206,Kartcher Mini,General,Completo,,Bueno,SI
H-207,Torquimetro,Manual,Completo,PSTH08003,Bueno,SI
H-208,Sierra sable compacta Milwaukee,General,Falta pila,,Bueno,SI
H-209,Martillo,Manual,Completo,N/A,Bueno,SI
H-210,Pinza pela cables,Manual,Completo,N/A,Bueno,SI
H-211,Segueta de arco / sierra manual,Manual,Completo,N/A,Bueno,SI
`;
  const base64 = Buffer.from(csvContent, 'utf-8').toString('base64');
  
  try {
    const res = await fetch('http://localhost:10000/api/herramientas/importar-excel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': 'inttec',
        'x-env': 'prod'
      },
      body: JSON.stringify({ fileBase64: base64, previewOnly: false, overwriteExisting: true })
    });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
}
testImport();
