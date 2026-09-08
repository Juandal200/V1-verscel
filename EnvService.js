/* Which environment is this request?
 *
 * Production and QA are two DEPLOYMENTS of this one Apps Script project, pinned to
 * different versions. That gives them different code. It does not give them different
 * settings: Script Properties, LockService and triggers are all project-scoped, so
 * both deployments read one property store. The environment therefore cannot BE a
 * property — both would read the same one.
 *
 * So it arrives with the request. doPost reads `env` out of the posted body, and that
 * field is set by the Vercel proxy from its own APP_ENV, which is per-Vercel-project
 * and so genuinely per-environment. The browser never supplies it and cannot change
 * it.
 *
 * WHY THE DEFAULT IS PRODUCTION
 *
 * Plenty of code here runs with no request at all: the onEdit trigger, time-driven
 * triggers, and anything run by hand from the editor. None of them can carry a flag,
 * and all of them are production work. Defaulting to production keeps them working.
 *
 * That default opens exactly one hole — a QA proxy that forgets the field would write
 * production, silently. envAssertDeployment_ closes it by checking the flag against
 * the deployment actually executing, so the dangerous case fails loudly instead.
 *
 * SCRIPT PROPERTIES THIS INTRODUCES
 *
 * Production keeps the names it already has. QA reads the _QA variant of each, and
 * never falls back to the production one:
 *
 *   DB_SPREADSHEET_ID_QA    the QA database. Missing means every QA request throws,
 *                           which is the intended behaviour — see dbGetSpreadsheetId_
 *   GOOGLE_CLIENT_ID_QA     optional. Only needed if QA uses its own OAuth client
 *                           rather than adding the QA origin to the production one
 *   VAPID_PUBLIC_KEY_QA     the public half of the QA push keypair. Must match the
 *                           private half in the QA Vercel project or push fails
 *
 * And one that is not per-environment:
 *
 *   QA_DEPLOYMENT_ID        the QA web-app deployment id, from `clasp list-deployments`.
 *                           Until this is set envAssertDeployment_ does nothing, so
 *                           this file is inert before the QA deployment exists.
 */

var ENV_PRODUCTION = 'production';
var ENV_QA         = 'qa';

/* Set once per execution by doPost. An Apps Script execution serves a single request,
 * which is what makes a file-level variable safe here — the same property _DB_SCOPE in
 * DatabaseService.js already relies on. */
var _APP_ENV = null;

function envSet_(raw) {
  var v = String(raw == null ? '' : raw).trim().toLowerCase();
  _APP_ENV = (v === ENV_QA) ? ENV_QA : ENV_PRODUCTION;
  return _APP_ENV;
}

function envName_()  { return _APP_ENV || ENV_PRODUCTION; }
function envIsQa_()  { return envName_() === ENV_QA; }

/* The environment-aware property read.
 *
 * In QA this reads ONLY <name>_QA. It deliberately does not fall through to the
 * production value when the QA one is missing: a QA environment that quietly borrows
 * a production setting is the precise failure this whole split exists to prevent.
 * Callers get '' and decide whether that is fatal — dbGetSpreadsheetId_ treats it as
 * fatal, which is why a half-configured QA cannot reach the production database.
 *
 * productionDefault exists for settings that are still literals in the source rather
 * than properties. It applies to production only, never to QA.
 */
function envProperty_(name, productionDefault) {
  var props = PropertiesService.getScriptProperties();

  if (envIsQa_()) {
    return props.getProperty(name + '_QA') || '';
  }

  return props.getProperty(name) || productionDefault || '';
}

/* Appended to Drive folder names. Folders resolve by name inside the Drive of whoever
 * deployed the script, so unless the two deployments were made by different accounts
 * they share every folder — and regenerating audio trashes the file it replaces. */
function envFolderSuffix_() {
  return envIsQa_() ? ' [QA]' : '';
}

/* The deployment id currently executing, from its own web-app URL. Empty when there is
 * no web app in play — an editor run or a trigger — which is not an error. */
function envDeploymentId_() {
  try {
    var url = ScriptApp.getService().getUrl();
    var m = String(url || '').match(/\/macros\/s\/([^\/]+)\//);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

/* Cross-check the flag the request carried against the deployment that received it.
 *
 * Inert until QA_DEPLOYMENT_ID is set, so this does nothing before the QA deployment
 * exists. Once set it catches both directions:
 *
 *   QA deployment, no qa flag   the proxy dropped it — this would have written
 *                               production, which is the whole hazard
 *   production deployment, qa   a QA proxy is pointed at the production URL
 *
 * Either way the request dies here rather than touching a database it should not.
 */
function envAssertDeployment_() {
  var qaId = PropertiesService.getScriptProperties().getProperty('QA_DEPLOYMENT_ID');
  if (!qaId) return;

  var running = envDeploymentId_();
  if (!running) return;

  var onQaDeployment = (running === qaId);

  if (onQaDeployment && !envIsQa_()) {
    throw new Error('Environment mismatch: this is the QA deployment but the request ' +
                    'did not carry env=qa. Refusing to touch the production database. ' +
                    'Check APP_ENV on the QA Vercel project.');
  }

  if (!onQaDeployment && envIsQa_()) {
    throw new Error('Environment mismatch: the request carried env=qa but this is not ' +
                    'the QA deployment. Check GAS_URL on the QA Vercel project.');
  }
}

/* One line per request naming the environment and the last six characters of the
 * spreadsheet it resolved. When something goes wrong at 2am this is the only record of
 * which database was actually touched. */
function envLogContext_(action) {
  var id = '';
  try { id = dbGetSpreadsheetId_(); } catch (e) { id = '(unresolved)'; }
  var tail = id.length > 6 ? id.slice(-6) : id;
  Logger.log('[ENV] ' + envName_() + ' db=…' + tail + ' action=' + (action || '?'));
}
