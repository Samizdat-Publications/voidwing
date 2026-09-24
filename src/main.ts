import './ui/styles.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
const game = new Game(root);
game.init().catch((err) => {
  console.error('VOID WING failed to start', err);
  root.insertAdjacentHTML('beforeend', '<div class="fatal">VOID WING could not start. WebGL2 is required.</div>');
});
