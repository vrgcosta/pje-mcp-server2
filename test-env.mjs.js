import dotenv from 'dotenv';

dotenv.config();

console.log('=== TESTE DE VARIÁVEIS DE AMBIENTE ===');
console.log('PJE_BASE_URL:', process.env.PJE_BASE_URL);
console.log('PJE_USERNAME:', process.env.PJE_USERNAME ? '[DEFINIDO]' : '[NÃO DEFINIDO]');
console.log('PJE_PASSWORD:', process.env.PJE_PASSWORD ? '[DEFINIDO]' : '[NÃO DEFINIDO]');
console.log('PJE_AUTH_METHOD:', process.env.PJE_AUTH_METHOD);
console.log('=====================================');