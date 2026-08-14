# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Base de Datos Local en Docker para Pruebas Aisladas 🐳

Para realizar pruebas sin riesgo de alterar o contaminar los datos reales de producción:

### 1. Iniciar la base de datos local
```bash
npm run db:up
```
Esto iniciará un contenedor PostgreSQL (puerto `5432`) y un servicio PostgREST (puerto `3000`) inicializados automáticamente con los archivos `01_schema.sql` y `02_seed.sql` (ubicados en `docker/init/`), los cuales incluyen toda la estructura, catálogos reales (clientes, sucursales, proveedores) y configuraciones básicas.

Adicionalmente, se incluyen los respaldos crudos `BaseDatos.sql` (INTTEC) y `BaseDatosDaravisa.sql` (Daravisa) en la raíz del proyecto para referencia o migración manual.

### 2. Usuarios Disponibles
Para conocer los correos de prueba disponibles, revisa el archivo `docker/init/02_seed.sql` en la sección de inserción de `usuarios`.

### 3. Configurar la App para el entorno Local
Asegúrate de que tu archivo `.env` apunte a tu servidor local:
```env
EXPO_PUBLIC_SUPABASE_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoicG9zdGdyZXMiLCJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.M82JoBr-CUPUbJPD7ZYGdwGwYSVjwPhcmuGd8YaIk2Q
```
*(Si estás probando desde un dispositivo físico Android/iOS o emulador en red local, usa la IP de tu PC en lugar de `localhost`, por ejemplo `http://192.168.1.X:3000`)*.

### 4. Reiniciar/Limpiar datos de prueba
Si deseas borrar todas las modificaciones hechas durante las pruebas y restaurar la base de datos limpia con los esquemas originales:
```bash
npm run db:reset
```

### 5. Detener el contenedor
```bash
npm run db:down
```

## Daravisa Setup Notes
- The Daravisa database uses the exact same schema as Inttec (BaseDatos.sql).
- To ensure proper functionality, Row Level Security (RLS) MUST BE DISABLED on all main tables (gastos, evidencias, registro_gasolina, etc.) in the Daravisa Supabase project.
- Ensure the 'tickets' bucket is created in Storage with public access and policies that allow ALL operations (SELECT, INSERT, UPDATE, DELETE) for authenticated users.

