/* Auditoría de seguridad externa (22-sep-2026), sección 15: MFA (TOTP) para
   Owner/Admin, con periodo de gracia — decisión de Victor, 22-sep-2026.

   Actualización (23-sep-2026): Victor pidió pausar por el momento que sea
   OBLIGATORIO (mfaHabilitado() ahora regresa `false`) — la función y el
   "Activar" desde "Mi cuenta" siguen ahí, solo no se fuerza a nadie. Las
   secciones 7 y 8 (banda y bloqueo) simulan que se reactiva
   (`window.mfaHabilitado = () => true`) para no perder la cobertura de esa
   lógica, ya que Victor puede pedir reactivarla más adelante.

   Los endpoints reales (accounts:signInWithPassword con mfaPendingCredential,
   v2/accounts/mfaEnrollment:start|finalize|withdraw, v2/accounts/mfaSignIn:finalize)
   viven en Identity Platform, que Victor todavía no ha activado en Firebase
   Console — no hay forma de probarlos de punta a punta contra Firebase de
   verdad todavía. Esta prueba en su lugar verifica que el CÓDIGO habla esa
   API con la forma exacta que documenta Google (nombres de campo
   verificados contra el cliente Go oficial, googleapis/google-api-go-client,
   identitytoolkit v1/v2 — ver el comentario junto a pedirMfa() en
   index.html) simulando las respuestas con overrides de pedirAuth/pedirMfa,
   nunca hablando con Firebase de verdad. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  // --------- 1) Reglas simples ---------
  const reglas = await page.evaluate(() => ({
    ownerAplica: mfaAplicaA('owner'), adminAplica: mfaAplicaA('admin'),
    analystNoAplica: mfaAplicaA('analyst'), viewerNoAplica: mfaAplicaA('viewer'),
    tecnicoNoAplica: mfaAplicaA('tecnico'), clienteNoAplica: mfaAplicaA('cliente'),
    fechaValida: !isNaN(new Date(MFA_OBLIGATORIO_DESDE + 'T00:00:00')),
    todavíaNoObligatorio: !mfaYaEsObligatorio(), // hoy (22-sep-2026) es antes de la fecha configurada.
    pausadoPorDefecto: !mfaHabilitado(), // pedido de Victor, 23-sep-2026: pausado hasta nuevo aviso.
  }));
  chkF('MFA aplica a Owner y Admin', reglas.ownerAplica && reglas.adminAplica);
  chkF('MFA NO aplica a Analyst/Viewer/Técnico/Cliente', !reglas.analystNoAplica && !reglas.viewerNoAplica && !reglas.tecnicoNoAplica && !reglas.clienteNoAplica);
  chkF('MFA_OBLIGATORIO_DESDE es una fecha válida', reglas.fechaValida);
  chkF('Todavía no es obligatorio (la fecha configurada sigue en el futuro)', reglas.todavíaNoObligatorio);
  chkF('mfaHabilitado() está en pausa por defecto (pedido de Victor, 23-sep-2026)', reglas.pausadoPorDefecto);

  // --------- 2) entrar() detecta mfaPendingCredential y lanza MFA_REQUERIDO ---------
  const resultadoEntrar = await page.evaluate(async () => {
    const original = window.pedirAuth;
    window.pedirAuth = async () => ({
      email: 'owner@a.com', localId: 'u-owner',
      mfaPendingCredential: 'CRED-FALSA', mfaInfo: [{ mfaEnrollmentId: 'MFA-1', totpInfo:{} }]
    });
    let capturado = null;
    try{ await entrar('owner@a.com', 'x'); }catch(e){ capturado = { mensaje: e.message, credencial: e.mfaPendingCredential, enrollmentId: e.mfaEnrollmentId, correo: e.correoMfa, uid: e.uidMfa }; }
    window.pedirAuth = original;
    return capturado;
  });
  chkF('entrar() lanza MFA_REQUERIDO en vez de terminar el login', resultadoEntrar && resultadoEntrar.mensaje === 'MFA_REQUERIDO');
  chkF('...con la credencial, el enrollmentId, el correo y el uid del primer paso', resultadoEntrar
    && resultadoEntrar.credencial === 'CRED-FALSA' && resultadoEntrar.enrollmentId === 'MFA-1'
    && resultadoEntrar.correo === 'owner@a.com' && resultadoEntrar.uid === 'u-owner');

  // --------- 3) Flujo completo de login con MFA, por la UI real ---------
  await page.evaluate(() => {
    window._pedirAuthOriginal = window.pedirAuth;
    window.pedirAuth = async (metodo) => {
      if(metodo === 'signInWithPassword') return { email:'owner@a.com', localId:'u-owner', mfaPendingCredential:'CRED-1', mfaInfo:[{ mfaEnrollmentId:'MFA-1', totpInfo:{} }] };
      return {};
    };
    window._arrancarNubeOriginal = window.arrancarNube;
    window.arrancarNube = async () => {};
    window._cargarPerfilOriginal = window.cargarPerfil;
    window.cargarPerfil = async () => { sesion.rol = 'owner'; sesion.nombre = 'Victor Owner'; guardarSesion(); };
  });
  await page.fill('#aCorreo', 'owner@a.com');
  await page.fill('#aClave', 'una-clave-cualquiera');
  await page.click('#aEntrar');
  await page.waitForTimeout(200);
  const trasPrimerPaso = await page.evaluate(() => ({
    formMfaVisible: getComputedStyle(document.getElementById('formMfa')).display !== 'none',
    formAccesoOculto: getComputedStyle(document.getElementById('formAcceso')).display === 'none',
    correoMostrado: document.getElementById('mfaCorreo').textContent,
  }));
  chkF('Tras usuario+contraseña correctos con MFA activo, se muestra la pantalla del código', trasPrimerPaso.formMfaVisible && trasPrimerPaso.formAccesoOculto);
  chkF('La pantalla del código muestra el correo correcto', trasPrimerPaso.correoMostrado === 'owner@a.com');

  await page.evaluate(() => {
    window.pedirMfa = async (metodo, cuerpo) => {
      if(metodo === 'mfaSignIn:finalize'){
        window._ultimoCuerpoFinalizeSignIn = cuerpo;
        return { idToken:'ID-NUEVO', refreshToken:'REF-NUEVO' };
      }
      return {};
    };
  });
  await page.fill('#mfaCodigo', '123456');
  await page.click('#mfaVerificar');
  await page.waitForTimeout(300);
  const trasSegundoPaso = await page.evaluate(() => ({
    haySesion: haySesion(), idToken: sesion.idToken, correo: sesion.correo, uid: sesion.uid,
    accesoAbierto: document.getElementById('acceso').classList.contains('abierto'),
    cuerpoEnviado: window._ultimoCuerpoFinalizeSignIn,
  }));
  chkF('Con el código correcto, la sesión SÍ queda establecida (idToken nuevo)', trasSegundoPaso.haySesion && trasSegundoPaso.idToken === 'ID-NUEVO');
  chkF('correo/uid vienen del primer paso, no del segundo (mfaSignIn:finalize no los manda)', trasSegundoPaso.correo === 'owner@a.com' && trasSegundoPaso.uid === 'u-owner');
  chkF('Se cierra la pantalla de acceso tras verificar', trasSegundoPaso.accesoAbierto === false);
  chkF('mfaSignIn:finalize se llamó con mfaPendingCredential + mfaEnrollmentId + el código', trasSegundoPaso.cuerpoEnviado
    && trasSegundoPaso.cuerpoEnviado.mfaPendingCredential === 'CRED-1'
    && trasSegundoPaso.cuerpoEnviado.mfaEnrollmentId === 'MFA-1'
    && trasSegundoPaso.cuerpoEnviado.totpVerificationInfo.verificationCode === '123456');

  await page.evaluate(() => {
    window.pedirAuth = window._pedirAuthOriginal;
    window.arrancarNube = window._arrancarNubeOriginal;
    window.cargarPerfil = window._cargarPerfilOriginal;
    salirSilencioso(true);
  });

  // --------- 4) "Mi cuenta": estado de MFA (activada / no activada) ---------
  await page.evaluate(() => {
    sesion.correo='owner2@a.com'; sesion.uid='u-owner2'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
  });
  await page.evaluate(() => {
    window.pedirAuth = async (metodo) => {
      if(metodo === 'lookup') return { users: [{ localId:'u-owner2', mfaInfo: [{ mfaEnrollmentId:'MFA-9', displayName:'Autenticador', totpInfo:{}, enrolledAt: new Date().toISOString() }] }] };
      return {};
    };
  });
  await page.evaluate(() => modalPerfil());
  await page.waitForTimeout(200);
  const estadoActivado = await page.evaluate(() => document.getElementById('pfMfaEstado').textContent);
  chkF('"Mi cuenta" SÍ muestra que la verificación en dos pasos está activada', /activada/i.test(estadoActivado));
  await page.evaluate(() => cerrarModal());

  await page.evaluate(() => {
    window.pedirAuth = async (metodo) => {
      if(metodo === 'lookup') return { users: [{ localId:'u-owner2', mfaInfo: [] }] };
      return {};
    };
  });
  await page.evaluate(() => modalPerfil());
  await page.waitForTimeout(200);
  const estadoPausado = await page.evaluate(() => document.getElementById('pfMfaEstado').textContent);
  chkF('Con mfaHabilitado()=false, Owner sin MFA ve que es opcional (no "requiere")', /opcional/i.test(estadoPausado) && !/requiere/i.test(estadoPausado));
  await page.evaluate(() => cerrarModal());

  // A partir de aquí se simula que Victor reactiva la obligatoriedad
  // (window.mfaHabilitado = () => true), para no perder cobertura de esa
  // lógica mientras está en pausa — queda así el resto de la prueba.
  await page.evaluate(() => { window.mfaHabilitado = () => true; });
  await page.evaluate(() => modalPerfil());
  await page.waitForTimeout(200);
  const estadoSinActivar = await page.evaluate(() => ({
    texto: document.getElementById('pfMfaEstado').textContent,
    traeFecha: document.getElementById('pfMfaEstado').textContent.includes(MFA_OBLIGATORIO_DESDE),
  }));
  chkF('Reactivado, sin MFA activado Owner ve que su permiso lo requiere', /requiere/i.test(estadoSinActivar.texto));
  chkF('...y ve la fecha límite antes de que sea obligatorio', estadoSinActivar.traeFecha);
  await page.evaluate(() => cerrarModal());

  // --------- 5) Activar MFA desde "Mi cuenta": start → QR/secreto → finalize ---------
  await page.evaluate(() => {
    window.pedirMfa = async (metodo, cuerpo) => {
      if(metodo === 'mfaEnrollment:start') return { totpSessionInfo: { sharedSecretKey:'JBSWY3DPEHPK3PXP', sessionInfo:'SESSION-ABC', hashingAlgorithm:'SHA1', verificationCodeLength:6, periodSec:30 } };
      if(metodo === 'mfaEnrollment:finalize'){ window._ultimoCuerpoFinalizeEnroll = cuerpo; return { idToken:'ID-CON-MFA', refreshToken:'REF-CON-MFA' }; }
      return {};
    };
    modalActivarMfa();
  });
  await page.waitForTimeout(200);
  const pantallaActivar = await page.evaluate(() => ({
    traeSecreto: document.getElementById('modalCuerpo').innerHTML.includes('JBSWY3DPEHPK3PXP'),
    traeQr: document.getElementById('modalCuerpo').querySelector('svg.codigo-qr') !== null,
    traeCampoCodigo: document.getElementById('mfaActCodigo') !== null,
  }));
  chkF('Al activar, se muestra el secreto en texto (para capturarlo a mano)', pantallaActivar.traeSecreto);
  chkF('Al activar, se muestra el QR (para escanearlo)', pantallaActivar.traeQr);
  chkF('Al activar, se pide el código de verificación', pantallaActivar.traeCampoCodigo);

  await page.fill('#mfaActCodigo', '654321');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(200);
  const trasActivar = await page.evaluate(() => ({
    idToken: sesion.idToken,
    cuerpoEnviado: window._ultimoCuerpoFinalizeEnroll,
    // El modal de activación se cierra y, como no era forzado, modalPerfil() vuelve a abrir "Mi cuenta" encima — por
    // eso se checa que YA NO esté el formulario de activación, no que el overlay entero haya desaparecido.
    yaNoEsPantallaDeActivar: document.getElementById('mfaActCodigo') === null,
  }));
  chkF('Al confirmar el código, sesion.idToken se actualiza al que ya refleja el MFA activo', trasActivar.idToken === 'ID-CON-MFA');
  chkF('mfaEnrollment:finalize se llamó con el sessionInfo del start + el código + displayName', trasActivar.cuerpoEnviado
    && trasActivar.cuerpoEnviado.totpVerificationInfo.sessionInfo === 'SESSION-ABC'
    && trasActivar.cuerpoEnviado.totpVerificationInfo.verificationCode === '654321'
    && !!trasActivar.cuerpoEnviado.displayName);
  chkF('El modal de activación se cierra tras activar con éxito (vuelve a "Mi cuenta")', trasActivar.yaNoEsPantallaDeActivar);
  await page.evaluate(() => cerrarModal());

  // --------- 6) Desactivar MFA: pide contraseña, reautentica, hace el withdraw ---------
  await page.evaluate(() => {
    window.pedirAuth = async (metodo) => {
      if(metodo === 'signInWithPassword') return { idToken:'ID-FRESCO', refreshToken:'REF-FRESCO' };
      return {};
    };
    window.pedirMfa = async (metodo, cuerpo) => {
      if(metodo === 'mfaEnrollment:withdraw'){ window._ultimoCuerpoWithdraw = cuerpo; return { idToken:'ID-SIN-MFA', refreshToken:'REF-SIN-MFA' }; }
      return {};
    };
    modalDesactivarMfa('MFA-9');
  });
  await page.fill('#mfaDesClave', 'mi-contraseña-actual');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(200);
  const trasDesactivar = await page.evaluate(() => ({
    idToken: sesion.idToken,
    cuerpoEnviado: window._ultimoCuerpoWithdraw,
  }));
  chkF('Al desactivar, sesion.idToken se actualiza al que ya refleja el MFA quitado', trasDesactivar.idToken === 'ID-SIN-MFA');
  chkF('mfaEnrollment:withdraw se llamó con el idToken FRESCO (de la recontraseña) y el mfaEnrollmentId correcto', trasDesactivar.cuerpoEnviado
    && trasDesactivar.cuerpoEnviado.idToken === 'ID-FRESCO' && trasDesactivar.cuerpoEnviado.mfaEnrollmentId === 'MFA-9');
  await page.evaluate(() => cerrarModal()); // modalDesactivarMfa() también reabre "Mi cuenta" al terminar — se cierra antes de seguir.

  // --------- 7) Banda de recordatorio (antes de la fecha límite) ---------
  await page.evaluate(() => {
    window.pedirAuth = async (metodo) => (metodo === 'lookup') ? { users: [{ mfaInfo: [] }] } : {};
    _bandaMfaOcultaEstaSesion = false;
  });
  await page.evaluate(() => revisarObligatoriedadMfa());
  await page.waitForTimeout(150);
  const conBanda = await page.evaluate(() => document.getElementById('bandaMfaRecordatorio').hidden);
  chkF('Owner sin MFA, antes de la fecha límite: SÍ se muestra la banda de recordatorio', conBanda === false);

  await page.click('#btnOcultarBandaMfa');
  const trasOcultar = await page.evaluate(() => document.getElementById('bandaMfaRecordatorio').hidden);
  chkF('"Recuérdamelo después" SÍ la oculta', trasOcultar === true);

  await page.evaluate(() => revisarObligatoriedadMfa());
  await page.waitForTimeout(150);
  const siguePreguntando = await page.evaluate(() => document.getElementById('bandaMfaRecordatorio').hidden);
  chkF('...y se queda oculta el resto de la sesión (no vuelve a insistir de inmediato)', siguePreguntando === true);

  // --------- 8) Después de la fecha límite: bloqueo real, no solo recordatorio ---------
  await page.evaluate(() => {
    window.mfaYaEsObligatorio = () => true; // simula que ya pasó MFA_OBLIGATORIO_DESDE, sin tener que mover el reloj del sistema.
    window.pedirMfa = async (metodo) => (metodo === 'mfaEnrollment:start') ? { totpSessionInfo:{ sharedSecretKey:'X', sessionInfo:'S' } } : {};
  });
  await page.evaluate(() => revisarObligatoriedadMfa());
  await page.waitForTimeout(200);
  const bloqueado = await page.evaluate(() => ({
    modalAbierto: document.getElementById('telon').classList.contains('abierto'),
    sinCancelar: document.getElementById('modalPie').querySelector('[data-modal="cancelar"]') === null,
  }));
  chkF('Después de la fecha límite, se abre el modal de activación SOLO (no una banda)', bloqueado.modalAbierto);
  chkF('...y sin botón "Cancelar": no es opcional', bloqueado.sinCancelar);

  // Intentar cerrarlo "por fuera" (Escape) NO debe cerrarlo — debe avisar y quedarse.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const trasEscape = await page.evaluate(() => document.getElementById('telon').classList.contains('abierto'));
  chkF('Escape NO cierra el modal obligatorio (guardarBorradorAlSalir lo detiene)', trasEscape === true);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
