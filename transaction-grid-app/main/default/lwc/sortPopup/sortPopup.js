import { LightningElement, api, track } from 'lwc';

export default class SortPopup extends LightningElement {
    @api sortableColumns = [];
    @track draftSorts = [];

    @api 
    set initialSorts(value) {
        this.draftSorts = value ? JSON.parse(JSON.stringify(value)) : [];
        if (this.draftSorts.length === 0) this.handleAddDraftSort();
        else this.updateSortLabels();
    }
    get initialSorts() { return this.draftSorts; }

    get hasDraftSorts() { return this.draftSorts.length > 0; }

    handleClose() { this.dispatchEvent(new CustomEvent('close')); }

    handleAddDraftSort() {
        this.draftSorts.push({
            id: Date.now() + Math.random(), 
            fieldName: '', label: '', direction: 'asc', icon: 'utility:arrowup', prefixLabel: ''
        });
        this.updateSortLabels();
    }

    updateSortLabels() {
        this.draftSorts.forEach((sort, index) => { sort.prefixLabel = index === 0 ? 'Sort by' : 'Then by'; });
        this.draftSorts = [...this.draftSorts];
    }

    handleDraftSortFieldChange(event) {
        const index = event.target.dataset.index;
        const val = event.detail.value;
        this.draftSorts[index].fieldName = val;
        const column = this.sortableColumns.find(c => c.value === val);
        this.draftSorts[index].label = column ? `Sort: ${column.label}` : '';
        this.draftSorts = [...this.draftSorts];
    }

    handleDraftSortDirectionToggle(event) {
        const index = event.currentTarget.dataset.index;
        const currentDir = this.draftSorts[index].direction;
        this.draftSorts[index].direction = currentDir === 'asc' ? 'desc' : 'asc';
        this.draftSorts[index].icon = this.draftSorts[index].direction === 'asc' ? 'utility:arrowup' : 'utility:arrowdown';
        this.draftSorts = [...this.draftSorts];
    }

    handleRemoveDraftSort(event) {
        const index = event.currentTarget.dataset.index;
        this.draftSorts.splice(index, 1);
        this.updateSortLabels();
    }

    resetAllSorts() {
        this.draftSorts = [];
        this.handleAddDraftSort();
    }

    applySorts() {
        const activeSorts = this.draftSorts.filter(s => s.fieldName);
        this.dispatchEvent(new CustomEvent('apply', { detail: { activeSorts } }));
    }
}