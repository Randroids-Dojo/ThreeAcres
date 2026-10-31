import '@fontsource-variable/fraunces';
import '@fontsource-variable/bricolage-grotesque';
import './ui/ui.css';

const dev = new URLSearchParams(location.search).get('dev');

if (dev === '2d' || dev === '3d' || dev === 'both') {
  void import('./dev/harness').then((m) => m.runHarness(dev));
} else if (dev === 'audio') {
  void import('./audio/devpage').then((m) => m.runAudioDev());
} else {
  void import('./shell/shell').then((m) => m.startShell());
}
