// netlify/functions/paypal-webhook.js

// Importa el SDK de administrador de Firebase para acceder a la base de datos de forma segura
const admin = require('firebase-admin');

// --- Configuración de Firebase ---
// La información de la cuenta de servicio se obtiene de las variables de entorno de Netlify
// Esto es más seguro que tener el archivo de claves en el código.
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
  // Solo procesar peticiones POST, que es como PayPal envía los webhooks.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // El cuerpo del evento viene como un string, lo parseamos a JSON.
    const paypalEvent = JSON.parse(event.body);

    // --- Verificación del Webhook (¡MUY IMPORTANTE!) ---
    // Esto asegura que la petición viene realmente de PayPal y no de un impostor.
    // Necesitarás configurar el PAYPAL_WEBHOOK_ID en las variables de entorno de Netlify.
    // Por ahora, para simplificar la prueba inicial, esta parte está comentada.
    // DEBES DESCOMENTARLA para un entorno de producción.
    /*
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    // Lógica de verificación real usando el SDK de PayPal o una verificación manual.
    // Por simplicidad, aquí asumimos que si el evento es del tipo correcto, es válido.
    // En un entorno real, la verificación es crucial.
    */
    
    // Comprueba si el evento es una orden de checkout aprobada.
    if (paypalEvent.event_type === 'CHECKOUT.ORDER.APPROVED') {
      console.log('Orden de checkout aprobada recibida.');

      const orderDetails = paypalEvent.resource;
      const purchaseUnit = orderDetails.purchase_units[0];
      
      // El 'custom_id' es donde enviamos nuestro JSON con apodo y mensaje, codificado en base64.
      const customId = purchaseUnit.custom_id;
      
      let nickname = 'Anónimo';
      let message = '¡Gracias por el apoyo!';

      if (customId) {
        try {
          // Decodifica el string base64 a un string JSON.
          const decodedString = Buffer.from(customId, 'base64').toString('utf8');
          const customData = JSON.parse(decodedString);
          
          // Asigna los valores si existen, si no, usa los valores por defecto.
          nickname = customData.nick || nickname;
          message = customData.msg || message;

        } catch (e) {
          console.error('Error al decodificar o parsear el custom_id:', e);
          // Si hay un error, simplemente se usarán los valores por defecto.
        }
      }

      // Prepara el documento que se guardará en Firestore.
      const donationData = {
        nickname: nickname,
        message: message,
        amount: purchaseUnit.amount.value,
        currency: purchaseUnit.amount.currency_code,
        paypalOrderId: orderDetails.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp() // Usa la hora del servidor.
      };

      // Añade el nuevo documento a la colección 'donations'.
      await db.collection('donations').add(donationData);

      console.log('Donación guardada en Firestore exitosamente:', donationData);
    }

    // Responde a PayPal con un status 200 OK para que sepa que recibimos el webhook.
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };

  } catch (error) {
    console.error('Error al procesar el webhook de PayPal:', error);
    // Si algo sale mal, informa del error.
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

