// POST /api/mp-webhook — notificações do Mercado Pago (pagamento Pix aprovado => credita diamantes)
import { route } from './_lib/http.js';
import { mpWebhook } from './_lib/shop.js';

export default route((db, user, body, req) => mpWebhook(db, body, req), { auth: false, methods: ['POST', 'GET'] });
