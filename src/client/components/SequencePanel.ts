import { annotationStore } from '../store/annotationStore.js';
import type { PdfViewer } from './PdfViewer.js';

export class SequencePanel {
  private panel: HTMLElement;
  private list: HTMLElement;
  private pdfViewer: PdfViewer | null = null;

  constructor(parent: HTMLElement, pdfViewer?: PdfViewer) {
    this.panel = document.createElement('div');
    this.panel.className = 'fixed top-0 right-0 h-full w-72 max-w-full bg-white shadow-2xl transform translate-x-full transition-transform duration-300 z-50';
    this.panel.innerHTML = `
      <div class="flex items-center justify-between p-4 border-b">
        <h2 class="font-semibold">Reading order</h2>
        <button id="seq-close" class="text-gray-500 hover:text-gray-800">&times;</button>
      </div>
      <ul id="seq-list" class="p-4 space-y-2 overflow-y-auto h-[calc(100%-56px)]"></ul>
    `;
    parent.appendChild(this.panel);

    this.pdfViewer = pdfViewer || null;

    this.list = this.panel.querySelector('#seq-list')!;

    // close btn
    this.panel.querySelector('#seq-close')!.addEventListener('click', () => this.hide());

    // keep in sync with store
    annotationStore.subscribe(() => this.render());

    // handle drag-and-drop
    this.list.addEventListener('dragstart', e => {
      const li = e.target as HTMLElement;
      li.classList.add('opacity-50');
      e.dataTransfer!.setData('text/plain', li.dataset.id!);
    });
    this.list.addEventListener('dragend', e => {
      (e.target as HTMLElement).classList.remove('opacity-50');
    });
    this.list.addEventListener('dragover', e => e.preventDefault());
    this.list.addEventListener('drop', e => {
      e.preventDefault();
      const draggedId = e.dataTransfer!.getData('text/plain');
      const dropTarget = (e.target as HTMLElement).closest('li');
      if (!dropTarget || !draggedId) return;

      const ids: string[] = Array.from(this.list.children).map(li => (li as HTMLElement).dataset.id!);

      // move draggedId before the drop target
      ids.splice(ids.indexOf(draggedId), 1);
      ids.splice(Array.from(this.list.children).indexOf(dropTarget), 0, draggedId);

      annotationStore.reorderAnnotations(ids);
    });
  }

  private getCurrentPage(): number {
    return this.pdfViewer?.getCurrentPage() || 1;
  }

  render(): void {
    const currentPage = this.getCurrentPage();
    const annos = annotationStore.getStore().annotations.filter(a => a.page_number === currentPage);
    this.list.innerHTML = '';

    annos.forEach((anno, i) => {
      const li = document.createElement('li');
      li.dataset.id = anno.id;
      li.draggable = true;
      li.className =
        'flex items-center space-x-2 p-2 bg-gray-100 rounded cursor-move select-none';
      li.innerHTML = `
        <span class="w-5 text-right">${i + 1}</span>
        <span class="flex-1 truncate text-xs">${anno.text || anno.type}</span>
        <button class="text-red-500 hover:text-red-700" title="Delete">&times;</button>
      `;
      li.querySelector('button')!.addEventListener('click', e => {
        e.stopPropagation();
        annotationStore.deleteAnnotation(anno.id);
      });
      this.list.appendChild(li);
    });
  }

  show(): void {
    this.panel.classList.remove('translate-x-full');
    this.render();
  }

  hide(): void {
    this.panel.classList.add('translate-x-full');
  }

  toggle(): void {
    this.panel.classList.contains('translate-x-full') ? this.show() : this.hide();
  }
}