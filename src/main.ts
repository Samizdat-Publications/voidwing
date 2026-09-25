// The one UI font: Chakra Petch (OFL-1.1), bundled from npm, latin subset only.
import '@fontsource/chakra-petch/latin-400.css';
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import './ui/styles.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
const game = new Game(root);
game.init().catch((err) => {
  console.error('VOID WING failed to start', err);
  root.insertAdjacentHTML('beforeend', '<div class="fatal">VOID WING could not start. WebGL2 is required.</div>');
});
