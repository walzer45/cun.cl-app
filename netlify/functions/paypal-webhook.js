// netlify/functions/paypal-webhook.js

// Importa el módulo 'querystring' para analizar el formato de datos de IPN
const querystring = require('querystring');
// Importa el SDK de administrador de Firebase
const admin = require('firebase-admin');

// --- Configuración de Firebase ---
// La información de la cuenta de servicio se obtiene de las variables de entorno de Netlify.
// ¡Asegúrate de haber configurado la variable de entorno FIREBASE_SERVICE_ACCOUNT en Netlify!
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("La variable de entorno FIREBASE_SERVICE_ACCOUNT no está definida.");
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Inicializa la app de Firebase Admin solo si no se ha hecho antes.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Obtiene una referencia a la base de datos de Firestore.
const db = admin.firestore();

// --- Lógica principal de la función ---
exports.handler = async (event) => {
  // Solo procesar peticiones POST.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Los datos de IPN vienen en formato x-www-form-urlencoded, no JSON.
    // Usamos 'querystring.parse' para convertirlos en un objeto de JavaScript.
    const ipnData = querystring.parse(event.body);
    console.log('Datos IPN de PayPal recibidos y procesados:', ipnData);

    // --- Verificación del Webhook (¡MUY IMPORTANTE!) ---
    // Con IPN, la verificación es diferente. Debes reenviar los datos a PayPal para confirmar su autenticidad.
    // Esta parte es crucial para la seguridad en producción para evitar donaciones falsas.
    // Por ahora, la omitimos para que puedas probar, pero DEBES implementarla.
    // Busca "PayPal IPN verification" para ver guías sobre cómo hacerlo.

    // Comprobamos si el pago se ha completado. IPN envía notificaciones para todo (fallidos, pendientes, etc.)
    if (ipnData.payment_status === 'Completed') {
      console.log('Pago completado recibido.');

      // El campo 'custom' en IPN es donde se envía información adicional.
      // Asumimos que aquí viene tu JSON con apodo y mensaje, codificado en base64.
      const customField = ipnData.custom;
      let nickname = 'Anónimo';
      let message = '¡Gracias por el apoyo!';

      if (customField) {
        try {
          // Decodifica el string base64 a un string JSON.
          const decodedString = Buffer.from(customField, 'base64').toString('utf8');
          const customData = JSON.parse(decodedString);
          
          // Asigna los valores si existen.
          nickname = customData.nick || nickname;
          message = customData.msg || message;
        } catch (e) {
          console.error('Error al decodificar o parsear el campo "custom":', e);
          // Si hay un error, se usarán los valores por defecto.
        }
      }

      // Prepara el documento que se guardará en Firestore usando los campos de IPN.
      const donationData = {
        nickname: nickname,
        message: message,
        amount: ipnData.mc_gross, // Campo de monto en IPN
        currency: ipnData.mc_currency, // Campo de moneda en IPN
        paypalOrderId: ipnData.txn_id, // ID de transacción en IPN
        payerEmail: ipnData.payer_email, // Email del donante
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Añade el nuevo documento a la colección 'donations'.
      // Usamos el ID de transacción como ID del documento para evitar duplicados.
      await db.collection('donations').doc(ipnData.txn_id).set(donationData);

      console.log('Donación guardada en Firestore exitosamente:', donationData);
    } else {
      console.log(`Estado del pago recibido: ${ipnData.payment_status}. No se procesa.`);
    }

    // Responde a PayPal con un status 200 OK. Esto es muy importante.
    return {
      statusCode: 200,
      body: 'Webhook IPN recibido.',
    };

  } catch (error) {
    console.error('Error fatal al procesar el webhook de PayPal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

