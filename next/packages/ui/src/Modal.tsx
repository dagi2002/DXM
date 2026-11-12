// Its own module so screens that don't use it don't download it (first-load budget, 03 §8).
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, Heading, Modal as RACModal, ModalOverlay } from 'react-aria-components';
import { IconButton } from './components';

export function Modal({
  isOpen,
  onOpenChange,
  title,
  children,
  closeLabel = 'Close',
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel?: string;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <RACModal className="w-full max-w-lg rounded-t-xl border border-border bg-surface shadow-xl sm:rounded-xl">
        <Dialog className="relative max-h-[90dvh] overflow-y-auto p-6 outline-none">
          <Heading slot="title" className="pr-10 font-display text-xl font-bold text-text">
            {title}
          </Heading>
          <IconButton label={closeLabel} slot="close" className="absolute top-3 right-3">
            <X size={18} aria-hidden="true" />
          </IconButton>
          <div className="mt-4">{children}</div>
        </Dialog>
      </RACModal>
    </ModalOverlay>
  );
}
