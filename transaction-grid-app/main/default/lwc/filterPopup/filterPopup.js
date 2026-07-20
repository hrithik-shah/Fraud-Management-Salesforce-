import { LightningElement, api, track } from 'lwc';

export default class FilterPopup extends LightningElement {
    @api rawFilters;
    @api mappedOptions; 
    
    @track draftFilters = {};
    @track dropdownSearchTerms = { Status__c: '', Transaction_ID__c: '', Product_Code__c: '', Customer_ID__c: '', Store_Location__c: '' };
    @track openDropdownName = '';

    connectedCallback() {
        const defaultFilters = { Status__c: [], Transaction_ID__c: [], Product_Code__c: [], Customer_ID__c: [], Store_Location__c: [], minAmount: null, maxAmount: null, minDate: null, maxDate: null };
        this.draftFilters = this.rawFilters ? JSON.parse(JSON.stringify(this.rawFilters)) : defaultFilters;
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    get statusDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Status__c' ? 'slds-is-open' : ''}`; }
    get txnIdDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Transaction_ID__c' ? 'slds-is-open' : ''}`; }
    get productDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Product_Code__c' ? 'slds-is-open' : ''}`; }
    get customerDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Customer_ID__c' ? 'slds-is-open' : ''}`; }
    get storeDropdownClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.openDropdownName === 'Store_Location__c' ? 'slds-is-open' : ''}`; }

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

    filterAndMapOptions(optionsArray, fieldName) {
        let opts = optionsArray || [];
        const term = (this.dropdownSearchTerms[fieldName] || '').toLowerCase();
        
        if (term) {
            opts = opts.filter(o => (o.label ? o.label.toLowerCase() : o.toLowerCase()).includes(term));
        }
        
        return opts.map(opt => {
            const val = opt.value || opt;
            const lbl = opt.label || opt;
            return { label: lbl, value: val, isChecked: (this.draftFilters[fieldName] || []).includes(val) };
        });
    }

    get statusOptionsMapped() {
        const rawOpts = [{ label: 'Pending', value: 'Pending' }, { label: 'Approved', value: 'Approved' }, { label: 'Cancelled', value: 'Cancelled' }, { label: 'Fraudulent', value: 'Fraudulent' }];
        return this.filterAndMapOptions(rawOpts, 'Status__c');
    }
    get txnIdOptionsMapped() { return this.filterAndMapOptions(this.mappedOptions?.allTxnIdOptions, 'Transaction_ID__c'); }
    get productOptionsMapped() { return this.filterAndMapOptions(this.mappedOptions?.allProductOptions, 'Product_Code__c'); }
    get customerOptionsMapped() { return this.filterAndMapOptions(this.mappedOptions?.allCustomerOptions, 'Customer_ID__c'); }
    get storeOptionsMapped() { return this.filterAndMapOptions(this.mappedOptions?.allStoreOptions, 'Store_Location__c'); }

    // --- Event Handlers ---
    handlePopoverClick(event) {
        if (!event.target.closest('.slds-combobox_container')) {
            this.openDropdownName = '';
        }
    }

    handleFocusDropdown(event) {
        const name = event.target.dataset.name;
        if (this.openDropdownName !== name) {
            this.openDropdownName = name;
            this.dropdownSearchTerms[name] = ''; 
        }
    }

    handleSearchDropdown(event) {
        const name = event.target.dataset.name;
        this.dropdownSearchTerms[name] = event.target.value;
    }

    toggleDropdown(event) {
        const dropdownName = event.currentTarget.dataset.name;
        if (this.openDropdownName === dropdownName) {
            this.openDropdownName = ''; 
        } else { 
            this.openDropdownName = dropdownName; 
            this.dropdownSearchTerms[dropdownName] = ''; 
        }
    }

    handleMultiSelect(event) {
        const fieldName = event.target.name;
        const value = event.target.value;
        let currentValues = [...(this.draftFilters[fieldName] || [])];
        
        if (event.target.checked) {
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
        if (section === 'date') { 
            this.draftFilters.minDate = null; 
            this.draftFilters.maxDate = null; 
        } else if (section === 'amount') { 
            this.draftFilters.minAmount = null; 
            this.draftFilters.maxAmount = null; 
        } else { 
            this.draftFilters[section] = []; 
            this.dropdownSearchTerms[section] = ''; 
        }
        this.draftFilters = { ...this.draftFilters };
    }

    resetAllFilters() {
        this.draftFilters = { Status__c: [], Transaction_ID__c: [], Product_Code__c: [], Customer_ID__c: [], Store_Location__c: [], minAmount: null, maxAmount: null, minDate: null, maxDate: null };
        this.openDropdownName = '';
        this.dropdownSearchTerms = { Status__c: '', Transaction_ID__c: '', Product_Code__c: '', Customer_ID__c: '', Store_Location__c: '' };
    }

    applyFilters() {
        this.dispatchEvent(new CustomEvent('apply', { detail: { filters: this.draftFilters } }));
    }
}