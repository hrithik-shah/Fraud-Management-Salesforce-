import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getTransactions from '@salesforce/apex/PartnerTransactionController.getTransactions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
import { publish, subscribe, MessageContext, APPLICATION_SCOPE } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import TRANSACTION_UPDATED_CHANNEL from '@salesforce/messageChannel/TransactionUpdated__c';

const STATUS_TABLE_CLASSES = { 'Approved': 'slds-text-color_success slds-text-title_bold', 'Fraudulent': 'slds-text-color_error slds-text-title_bold', 'Cancelled': 'slds-text-color_weak slds-text-title_bold', 'Pending': 'slds-text-title_bold' };
const STATUS_MODAL_CLASSES = { 'Approved': 'badge badge-approved', 'Fraudulent': 'badge badge-fraudulent', 'Cancelled': 'badge badge-cancelled', 'Pending': 'badge badge-pending' };

const COLUMNS = [
    { label: 'Transaction ID', fieldName: 'Transaction_ID__c', type: 'text' },
    { label: 'Status', fieldName: 'Status__c', type: 'text', cellAttributes: { class: { fieldName: 'statusTableClass' } } },
    { label: 'Amount', fieldName: 'Amount__c', type: 'currency' },
    { label: 'Date', fieldName: 'Transaction_Date__c', type: 'date' },
    { label: 'Product Code', fieldName: 'Product_Code__c', type: 'text' },
    { label: 'Store Location', fieldName: 'Store_Location__c', type: 'text' },
    { label: 'Masked Card', fieldName: 'Masked_Card_Number__c', type: 'text' },
    { label: 'Customer ID', fieldName: 'Customer_ID__c', type: 'text' },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'View Details', name: 'view_details', iconName: 'utility:preview' },
                { label: 'Approve', name: 'approve_txn', iconName: 'utility:check' },
                { label: 'Cancel', name: 'cancel_txn', iconName: 'utility:close' },
                { label: 'Mark Fraudulent', name: 'fraud_txn', iconName: 'utility:warning' }
            ]
        }
    }
];

export default class TransactionDataGrid extends LightningElement {
    columns = COLUMNS;
    
    @track allData = [];      
    @track filteredData = []; 
    @track paginatedData = [];
    selectedRows = [];
    wiredTransactionResult;
    subscription = null;

    @track isFilterPopupOpen = false;
    @track openDropdownName = ''; // Tracks which custom multi-select is expanded
    
    // Active Filters
    @track filters = { 
        Status__c: [], Transaction_ID__c: [], Product_Code__c: [], 
        Customer_ID__c: [], Store_Location__c: [], 
        minAmount: null, maxAmount: null, minDate: null, maxDate: null 
    }; 
    @track draftFilters = { ...this.filters };

    // Holds the text actively being typed into the dropdown search box
    @track dropdownSearchTerms = { Status__c: '', Transaction_ID__c: '', Product_Code__c: '', Customer_ID__c: '', Store_Location__c: '' };

    // Raw Unique Options Extracted from Data
    allTxnIdOptions = []; 
    allProductOptions = []; 
    allCustomerOptions = [];
    allStoreOptions = [];

    @track activeSorts = []; 
    currentPage = 1; pageSize = 10;
    isModalOpen = false; @track selectedRecord = null;

    @wire(MessageContext) messageContext;

    // --- Standard Getters ---
    get isBulkDisabled() { return this.selectedRows.length === 0; }
    get pageSizeStr() { return this.pageSize.toString(); }
    get totalPages() { return Math.ceil(this.filteredData.length / this.pageSize) || 1; }
    get isFirstPage() { return this.currentPage === 1; }
    get isLastPage() { return this.currentPage >= this.totalPages; }
    
    get filterButtonClass() { return this.isFilterPopupOpen || this.activeFilterTags.length > 0 ? 'dribbble-btn active-btn' : 'dribbble-btn'; }
    get hasActiveFiltersOrSorts() { return this.activeFilterTags.length > 0 || this.activeSorts.length > 0; }
    get pageSizeOptions() { return [{ label: '10', value: '10' }, { label: '25', value: '25' }, { label: '50', value: '50' }, { label: '100', value: '100' }]; }
    get sortableColumns() { return this.columns.filter(c => c.fieldName && !c.fieldName.includes('statusTableClass')).map(c => ({ label: c.label, value: c.fieldName })); }

    // --- Custom Multi-Select Dropdown Getters ---
    get statusDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Status__c' ? 'slds-is-open' : ''}`; }
    get txnIdDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Transaction_ID__c' ? 'slds-is-open' : ''}`; }
    get productDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Product_Code__c' ? 'slds-is-open' : ''}`; }
    get customerDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Customer_ID__c' ? 'slds-is-open' : ''}`; }
    get storeDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Store_Location__c' ? 'slds-is-open' : ''}`; }

    // --- Dynamic Input Display Text (Search Term when open, Summary when closed) ---
    get statusInputValue() { return this.openDropdownName === 'Status__c' ? this.dropdownSearchTerms.Status__c : this.getDisplayText('Status__c'); }
    get txnIdInputValue() { return this.openDropdownName === 'Transaction_ID__c' ? this.dropdownSearchTerms.Transaction_ID__c : this.getDisplayText('Transaction_ID__c'); }
    get productInputValue() { return this.openDropdownName === 'Product_Code__c' ? this.dropdownSearchTerms.Product_Code__c : this.getDisplayText('Product_Code__c'); }
    get customerInputValue() { return this.openDropdownName === 'Customer_ID__c' ? this.dropdownSearchTerms.Customer_ID__c : this.getDisplayText('Customer_ID__c'); }
    get storeInputValue() { return this.openDropdownName === 'Store_Location__c' ? this.dropdownSearchTerms.Store_Location__c : this.getDisplayText('Store_Location__c'); }

    getDisplayText(field) {
        const arr = this.draftFilters[field] || [];
        if (arr.length === 0) return '';
        if (arr.length <= 2) return arr.join(', ');
        return `${arr.length} selected`;
    }

    // --- Dynamically Filtered & Mapped Options ---
    filterAndMapOptions(optionsArray, fieldName) {
        let opts = optionsArray;
        const term = (this.dropdownSearchTerms[fieldName] || '').toLowerCase();
        
        if (term) {
            // Check label property if it's an object array (like Status), otherwise check string directly
            opts = opts.filter(o => (o.label ? o.label.toLowerCase() : o.toLowerCase()).includes(term));
        }
        
        // Map to standard { label, value, isChecked } object
        return opts.map(opt => {
            const val = opt.value || opt;
            const lbl = opt.label || opt;
            return { label: lbl, value: val, isChecked: this.draftFilters[fieldName].includes(val) };
        });
    }

    get statusOptionsMapped() {
        const rawOpts = [{ label: 'Pending', value: 'Pending' }, { label: 'Approved', value: 'Approved' }, { label: 'Cancelled', value: 'Cancelled' }, { label: 'Fraudulent', value: 'Fraudulent' }];
        return this.filterAndMapOptions(rawOpts, 'Status__c');
    }
    get txnIdOptionsMapped() { return this.filterAndMapOptions(this.allTxnIdOptions, 'Transaction_ID__c'); }
    get productOptionsMapped() { return this.filterAndMapOptions(this.allProductOptions, 'Product_Code__c'); }
    get customerOptionsMapped() { return this.filterAndMapOptions(this.allCustomerOptions, 'Customer_ID__c'); }
    get storeOptionsMapped() { return this.filterAndMapOptions(this.allStoreOptions, 'Store_Location__c'); }

    // --- Dynamic Tags with Smart Truncation ---
    get activeFilterTags() {
        let tags = [];
        const f = this.filters;
        
        const formatLabel = (prefix, arr) => arr.length > 2 ? `${prefix}: ${arr.length} selected` : `${prefix}: ${arr.join(', ')}`;

        if (f.Transaction_ID__c && f.Transaction_ID__c.length > 0) tags.push({ name: 'Transaction_ID__c', label: formatLabel('ID', f.Transaction_ID__c) });
        if (f.Product_Code__c && f.Product_Code__c.length > 0) tags.push({ name: 'Product_Code__c', label: formatLabel('Product', f.Product_Code__c) });
        if (f.Customer_ID__c && f.Customer_ID__c.length > 0) tags.push({ name: 'Customer_ID__c', label: formatLabel('Customer', f.Customer_ID__c) });
        if (f.Store_Location__c && f.Store_Location__c.length > 0) tags.push({ name: 'Store_Location__c', label: formatLabel('Store', f.Store_Location__c) });
        if (f.Status__c && f.Status__c.length > 0) tags.push({ name: 'Status__c', label: formatLabel('Status', f.Status__c) });
        
        if (f.minAmount != null && f.minAmount !== '') tags.push({ name: 'minAmount', label: `Min $: ${f.minAmount}` });
        if (f.maxAmount != null && f.maxAmount !== '') tags.push({ name: 'maxAmount', label: `Max $: ${f.maxAmount}` });
        if (f.minDate) tags.push({ name: 'minDate', label: `From: ${f.minDate}` });
        if (f.maxDate) tags.push({ name: 'maxDate', label: `To: ${f.maxDate}` });
        return tags;
    }

    connectedCallback() {
        this.subscription = subscribe(this.messageContext, TRANSACTION_SELECTED_CHANNEL, (msg) => this.handleMessage(msg), { scope: APPLICATION_SCOPE });
    }

    handleMessage(msg) {
        if (msg.action === 'approve_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Approved');
        else if (msg.action === 'cancel_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Cancelled');
        else if (msg.action === 'fraud_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Fraudulent');
    }

    @wire(getTransactions)
    wiredTransactions(result) {
        this.wiredTransactionResult = result;
        if (result.data) {
            this.allData = result.data.map(row => ({
                ...row,
                Masked_Card_Number__c: row.Card__r ? row.Card__r.Masked_Card_Number__c : '',
                Customer_ID__c: row.Card__r ? row.Card__r.Customer_ID__c : '',
                statusTableClass: STATUS_TABLE_CLASSES[row.Status__c] || '',
                statusModalClass: STATUS_MODAL_CLASSES[row.Status__c] || ''
            }));
            this.extractUniqueOptions();
            this.processDataEngine();
        } else if (result.error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: result.error.body?.message || result.error.message, variant: 'error' }));
        }
    }

    extractUniqueOptions() {
        const txnIds = new Set(); const products = new Set(); const customers = new Set(); const stores = new Set();
        this.allData.forEach(txn => {
            if (txn.Transaction_ID__c) txnIds.add(txn.Transaction_ID__c);
            if (txn.Product_Code__c) products.add(txn.Product_Code__c);
            if (txn.Customer_ID__c) customers.add(txn.Customer_ID__c);
            if (txn.Store_Location__c) stores.add(txn.Store_Location__c);
        });
        
        this.allTxnIdOptions = Array.from(txnIds).sort();
        this.allProductOptions = Array.from(products).sort();
        this.allCustomerOptions = Array.from(customers).sort();
        this.allStoreOptions = Array.from(stores).sort();
    }

    // --- Popover UI & Custom Dropdown Controls ---
    toggleFilterPopup() {
        this.isFilterPopupOpen = !this.isFilterPopupOpen;
        if (this.isFilterPopupOpen) {
            this.draftFilters = { ...this.filters };
            this.openDropdownName = ''; 
            this.clearAllSearchTerms();
        }
    }

    // Handles clicking empty space in the popover to close dropdowns
    handlePopoverClick(event) {
        if (!event.target.closest('.slds-combobox_container')) {
            this.openDropdownName = '';
        }
    }

    // Opens dropdown on focus and clears search
    handleFocusDropdown(event) {
        const name = event.target.dataset.name;
        if (this.openDropdownName !== name) {
            this.openDropdownName = name;
            this.dropdownSearchTerms[name] = ''; 
        }
    }

    // Updates text search term
    handleSearchDropdown(event) {
        const name = event.target.dataset.name;
        this.dropdownSearchTerms[name] = event.target.value;
    }

    // Toggles dropdown via Chevron button
    toggleDropdown(event) {
        const dropdownName = event.currentTarget.dataset.name;
        if (this.openDropdownName === dropdownName) {
            this.openDropdownName = ''; // Close it
        } else {
            this.openDropdownName = dropdownName;
            this.dropdownSearchTerms[dropdownName] = ''; // Clear search when opening
        }
    }

    handleMultiSelect(event) {
        const fieldName = event.target.name;
        const value = event.target.value;
        const isChecked = event.target.checked;
        
        let currentValues = [...this.draftFilters[fieldName]];
        if (isChecked) {
            currentValues.push(value);
        } else {
            currentValues = currentValues.filter(v => v !== value);
        }
        this.draftFilters = { ...this.draftFilters, [fieldName]: currentValues };
    }

    handleDraftChange(event) {
        const { name, value } = event.target;
        this.draftFilters = { ...this.draftFilters, [name]: value === '' ? null : value };
    }

    resetSection(event) {
        const section = event.currentTarget.dataset.section;
        if (section === 'date') { this.draftFilters.minDate = null; this.draftFilters.maxDate = null; }
        else if (section === 'amount') { this.draftFilters.minAmount = null; this.draftFilters.maxAmount = null; }
        else { 
            this.draftFilters[section] = []; 
            this.dropdownSearchTerms[section] = '';
        }
        this.draftFilters = { ...this.draftFilters };
    }

    clearAllSearchTerms() {
        this.dropdownSearchTerms = { Status__c: '', Transaction_ID__c: '', Product_Code__c: '', Customer_ID__c: '', Store_Location__c: '' };
    }

    resetAllFilters() {
        this.draftFilters = { 
            Status__c: [], Transaction_ID__c: [], Product_Code__c: [], 
            Customer_ID__c: [], Store_Location__c: [], 
            minAmount: null, maxAmount: null, minDate: null, maxDate: null 
        };
        this.openDropdownName = '';
        this.clearAllSearchTerms();
    }

    applyFilters() {
        this.filters = { ...this.draftFilters };
        this.isFilterPopupOpen = false;
        this.currentPage = 1;
        this.processDataEngine();
    }

    handleRemoveFilter(event) {
        const fieldName = event.target.name;
        this.filters = { ...this.filters, [fieldName]: (fieldName.includes('Amount') || fieldName.includes('Date')) ? null : [] };
        this.draftFilters = { ...this.filters };
        this.currentPage = 1;
        this.processDataEngine();
    }

    // --- Data Processing Engine ---
    processDataEngine() {
        let result = this.allData.filter(row => {
            let match = true;

            const arrayFields = ['Status__c', 'Transaction_ID__c', 'Product_Code__c', 'Customer_ID__c', 'Store_Location__c'];
            arrayFields.forEach(field => {
                if (this.filters[field] && this.filters[field].length > 0) {
                    match = match && this.filters[field].includes(row[field]);
                }
            });
            
            if (this.filters.minAmount != null && this.filters.minAmount !== '') match = match && row.Amount__c >= parseFloat(this.filters.minAmount);
            if (this.filters.maxAmount != null && this.filters.maxAmount !== '') match = match && row.Amount__c <= parseFloat(this.filters.maxAmount);

            if (this.filters.minDate) {
                let minD = new Date(this.filters.minDate); minD.setHours(0,0,0,0);
                match = match && new Date(row.Transaction_Date__c) >= minD;
            }
            if (this.filters.maxDate) {
                let maxD = new Date(this.filters.maxDate); maxD.setHours(23,59,59,999);
                match = match && new Date(row.Transaction_Date__c) <= maxD;
            }

            return match;
        });

        if (this.activeSorts.length > 0) {
            result.sort((a, b) => {
                for (let sort of this.activeSorts) {
                    let valA = a[sort.fieldName]; let valB = b[sort.fieldName];
                    if (valA === valB) continue; 
                    let isAsc = sort.direction === 'asc';
                    if (valA == null) return isAsc ? -1 : 1;
                    if (valB == null) return isAsc ? 1 : -1;
                    return (valA < valB) ? (isAsc ? -1 : 1) : (isAsc ? 1 : -1);
                }
                return 0;
            });
        }

        this.filteredData = result;
        this.updatePagination();
    }

    // --- Sorting & Pagination ---
    handleAddSort(event) {
        const fieldName = event.detail.value;
        const column = this.columns.find(c => c.fieldName === fieldName);
        let existingSortIndex = this.activeSorts.findIndex(s => s.fieldName === fieldName);
        if (existingSortIndex > -1) {
            let currentDir = this.activeSorts[existingSortIndex].direction;
            this.activeSorts[existingSortIndex].direction = currentDir === 'asc' ? 'desc' : 'asc';
            this.activeSorts[existingSortIndex].icon = this.activeSorts[existingSortIndex].direction === 'asc' ? 'utility:arrowup' : 'utility:arrowdown';
        } else {
            this.activeSorts = [...this.activeSorts, { fieldName: fieldName, label: `${column.label}`, direction: 'asc', icon: 'utility:arrowup' }];
        }
        event.target.value = null; 
        this.processDataEngine();
    }
    
    handleRemoveSort(event) { this.activeSorts.splice(event.target.name, 1); this.activeSorts = [...this.activeSorts]; this.processDataEngine(); }
    handlePageSizeChange(event) { this.pageSize = parseInt(event.detail.value, 10); this.currentPage = 1; this.updatePagination(); }
    handlePrevPage() { if (this.currentPage > 1) { this.currentPage--; this.updatePagination(); } }
    handleNextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; this.updatePagination(); } }
    updatePagination() { const start = (this.currentPage - 1) * this.pageSize; this.paginatedData = this.filteredData.slice(start, start + this.pageSize); }
    handleRowSelection(event) { this.selectedRows = event.detail.selectedRows.map(row => row.Id); }
    
    // --- Actions ---
    handleRowAction(event) {
        const action = event.detail.action.name; const row = event.detail.row;
        switch (action) {
            case 'view_details': this.selectedRecord = row; this.isModalOpen = true; publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: row.Id }); break;
            case 'approve_txn': this.processUpdates([row.Id], 'Approved'); break;
            case 'cancel_txn': this.processUpdates([row.Id], 'Cancelled'); break;
            case 'fraud_txn': this.processUpdates([row.Id], 'Fraudulent'); break;
        }
    }
    handleBulkApprove() { this.processUpdates(this.selectedRows, 'Approved'); }
    handleBulkCancel() { this.processUpdates(this.selectedRows, 'Cancelled'); }
    handleBulkFraud() { this.processUpdates(this.selectedRows, 'Fraudulent'); }

    processUpdates(recordIds, newStatus) {
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' }));
                this.selectedRows = []; this.template.querySelector('lightning-datatable').selectedRows = [];
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                return refreshApex(this.wiredTransactionResult);
            })
            .catch(error => this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body?.message || error.message, variant: 'error' })));
    }
    closeModal() { this.isModalOpen = false; this.selectedRecord = null; }
}