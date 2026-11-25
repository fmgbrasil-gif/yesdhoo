import { Power } from 'lucide-react';
import { ActionForm, Modal } from './ui';
import { toggleMedia } from '@/app/(painel)/midias/actions';

/** Botao Desativar/Ativar da midia: desativada, para de rodar em todas as telas e operacoes (sem sair das playlists). */
export function MediaToggle({ media, screens, small = false }: { media: { id: string; name: string; active: boolean }; screens: number; small?: boolean }) {
  const size = small ? '!px-2.5 !py-1.5' : '';
  if (!media.active) {
    return (
      <Modal trigger={<><Power size={15} /> Ativar</>} triggerClass={`btn-ghost ${size} !border-emerald-300 !text-emerald-700`} titleAttr="Ativar a mídia" title={`Ativar “${media.name}”?`}>
        <ActionForm action={toggleMedia} submit="Sim, ativar" cancel>
          <input type="hidden" name="id" value={media.id} />
          <p className="text-sm text-ink-500">A mídia volta a rodar nas {screens} tela(s) em cuja playlist ela está, em até 20 segundos (se o período agendado permitir).</p>
        </ActionForm>
      </Modal>
    );
  }
  return (
    <Modal trigger={<><Power size={15} /> Desativar</>} triggerClass={`btn-ghost ${size} !border-red-200 !text-red-600`} titleAttr="Desativar a mídia" title={`Desativar “${media.name}”?`}>
      <ActionForm action={toggleMedia} submit="Sim, desativar" submitClass="btn-danger" cancel>
        <input type="hidden" name="id" value={media.id} />
        <p className="text-sm text-ink-500">A mídia <b>para de rodar em todas as telas e operações</b> ({screens} tela{screens === 1 ? '' : 's'}) em até 20 segundos. Nada é apagado: ela continua nas playlists e volta a passar quando você ativar de novo.</p>
      </ActionForm>
    </Modal>
  );
}
