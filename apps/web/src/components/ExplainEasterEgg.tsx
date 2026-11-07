import { useEffect, useState } from 'react';
import { Icon, Modal } from '@circuitlab/ui';
import { EXPLAIN_EGG_EVENT } from '../easterEgg';

export function ExplainEasterEgg() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEgg = () => setOpen(true);
    window.addEventListener(EXPLAIN_EGG_EVENT, onEgg);
    return () => window.removeEventListener(EXPLAIN_EGG_EVENT, onEgg);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="CircuitLab">
      <div className="easter-egg">
        <div className="easter-egg-mark">
          <Icon name="spark" size={26} />
        </div>
        <p className="easter-egg-message">Thank you for using circuitlab!</p>
      </div>
    </Modal>
  );
}
