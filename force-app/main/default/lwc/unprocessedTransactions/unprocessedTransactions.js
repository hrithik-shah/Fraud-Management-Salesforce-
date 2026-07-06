import { LightningElement, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPaginatedTransactions from '@salesforce/apex/TransactionPaginationController.getPaginatedTransactions';
import getFilterOptions from '@salesforce/apex/TransactionPaginationController.getFilterOptions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
import { publish, subscribe, MessageContext, APPLICATION_SCOPE } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import TRANSACTION_UPDATED_CHANNEL from '@salesforce/messageChannel/TransactionUpdated__c'; 

const COLUMNS = [
    { label: 'Transaction ID', fieldName: 'Transaction_ID__c' },
    { label: 'Product Code', fieldName: 'Product_Code__c' },
    { label: 'Store Location', fieldName: 'Store_Location__c' },
    { label: 'Masked Card', fieldName: 'MaskedCard', type: 'text' },
    { label: 'Date', fieldName: 'Transaction_Date__c', type: 'date' },
    { label: 'Amount', fieldName: 'Amount__c', type: 'currency' },
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

export default class UnprocessedTransactions extends LightningElement {
    columns = COLUMNS;
    @track transactions = [];
    @track error;
    
    // Lazy Loading Variables
    pageSize = 50;
    currentPage = 1;
    totalRecords = 0;
    @track enableInfiniteLoading = true;
    isLoading = false;
    @track filtersJSON = '{"Status__c":["Pending"]}';
    @track sortsJSON = '[]'; 

    selectedRows = [];
    currentSelectedId = null; 
    subscription = null;

    @track filters = { txnId: '', product: '', store: '', masked: '', minAmt: null, maxAmt: null, dateFrom: null, dateTo: null };

    // --- Searchable Dropdown Trackers ---
    @track allTxnIdOptions = [];
    @track allProductOptions = [];
    @track allStoreOptions = [];
    @track allMaskedOptions = [];

    @track txnIdOptions = [];
    @track productOptions = [];
    @track storeOptions = [];
    @track maskedOptions = [];

    @track showTxnIdDropdown = false;
    @track showProductDropdown = false;
    @track showStoreDropdown = false;
    @track showMaskedDropdown = false;

    @wire(MessageContext) messageContext;

    get isBulkDisabled() {
        return this.selectedRows.length === 0;
    }

    get txnIdComboboxClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showTxnIdDropdown ? 'slds-is-open' : ''}`; }
    get productComboboxClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showProductDropdown ? 'slds-is-open' : ''}`; }
    get storeComboboxClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showStoreDropdown ? 'slds-is-open' : ''}`; }
    get maskedComboboxClass() { return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showMaskedDropdown ? 'slds-is-open' : ''}`; }

    connectedCallback() {
        this.subscription = subscribe(
            this.messageContext,
            TRANSACTION_SELECTED_CHANNEL,
            (message) => this.handleMessage(message),
            { scope: APPLICATION_SCOPE }
        );
        this.applyFilters(); // Kickoff initial fetch
    }

    handleMessage(message) {
        if (message.action === 'approve_txn' && message.transactionId) this.processUpdates([message.transactionId], 'Approved');
        else if (message.action === 'cancel_txn' && message.transactionId) this.processUpdates([message.transactionId], 'Cancelled');
        else if (message.action === 'fraud_txn' && message.transactionId) this.processUpdates([message.transactionId], 'Fraudulent');
    }

    @wire(getFilterOptions)
    wiredFilterOptions({ error, data }) {
        if (data) {
            this.allTxnIdOptions = data.Transaction_ID__c || [];
            this.allProductOptions = data.Product_Code__c || [];
            this.allStoreOptions = data.Store_Location__c || [];
            this.allMaskedOptions = data.Masked_Card_Number__c || []; 
        } else if (error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error loading filters', message: error.body?.message || error.message, variant: 'error' }));
        }
    }

    loadMoreData(event) {
        if (this.isLoading) return;
        
        if (this.transactions.length >= this.totalRecords && this.totalRecords > 0) {
            this.enableInfiniteLoading = false;
            if (event) { event.target.isLoading = false; }
            return;
        }

        this.isLoading = true;
        if (event) { event.target.isLoading = true; }

        getPaginatedTransactions({ 
            pageSize: this.pageSize, 
            pageNumber: this.currentPage, 
            filtersJSON: this.filtersJSON, 
            sortsJSON: this.sortsJSON 
        })
        .then(result => {
            this.totalRecords = result.totalItemCount;
            
            const newRecords = result.records.map(row => ({
                ...row,
                MaskedCard: row.Card__r ? row.Card__r.Masked_Card_Number__c : ''
            }));

            // Append new records
            this.transactions = [...this.transactions, ...newRecords];
            
            // Set initial selected item context on first load
            if (this.currentPage === 1 && this.transactions.length > 0) {
                const isValid = this.transactions.some(txn => txn.Id === this.currentSelectedId);
                if (!isValid) this.currentSelectedId = this.transactions[0].Id;
                this.publishSelection(this.currentSelectedId);
            } else if (this.currentPage === 1 && this.transactions.length === 0) {
                this.currentSelectedId = null;
                this.publishSelection(null);
            }

            this.currentPage++;
            this.isLoading = false;
            this.error = undefined;
            if (event) { event.target.isLoading = false; }
        })
        .catch(err => {
            this.error = err.body ? err.body.message : err.message;
            this.isLoading = false;
            if (event) { event.target.isLoading = false; }
        });
    }

    // --- Searchable Dropdown Event Handlers ---
    openDropdown(event) {
        const name = event.target.name;
        if (name === 'txnId') { this.txnIdOptions = this.allTxnIdOptions; this.showTxnIdDropdown = true; }
        else if (name === 'product') { this.productOptions = this.allProductOptions; this.showProductDropdown = true; }
        else if (name === 'store') { this.storeOptions = this.allStoreOptions; this.showStoreDropdown = true; }
        else if (name === 'masked') { this.maskedOptions = this.allMaskedOptions; this.showMaskedDropdown = true; }
    }

    handleSearch(event) {
        const name = event.target.name;
        const searchVal = event.target.value.toLowerCase();
        
        this.filters = { ...this.filters, [name]: event.target.value };

        if (name === 'txnId') { this.txnIdOptions = this.allTxnIdOptions.filter(opt => opt.toLowerCase().includes(searchVal)); this.showTxnIdDropdown = true; }
        else if (name === 'product') { this.productOptions = this.allProductOptions.filter(opt => opt.toLowerCase().includes(searchVal)); this.showProductDropdown = true; }
        else if (name === 'store') { this.storeOptions = this.allStoreOptions.filter(opt => opt.toLowerCase().includes(searchVal)); this.showStoreDropdown = true; }
        else if (name === 'masked') { this.maskedOptions = this.allMaskedOptions.filter(opt => opt.toLowerCase().includes(searchVal)); this.showMaskedDropdown = true; }
    }

    handleSelection(event) {
        const { name, value } = event.currentTarget.dataset;
        this.filters = { ...this.filters, [name]: value };

        this.showTxnIdDropdown = false;
        this.showProductDropdown = false;
        this.showStoreDropdown = false;
        this.showMaskedDropdown = false;

        this.applyFilters();
    }

    closeDropdown(event) {
        const name = event.target.name;
        setTimeout(() => {
            const currentValue = this.filters[name] ? this.filters[name].toLowerCase() : '';
            let validOptions = [];

            if (name === 'txnId') { this.showTxnIdDropdown = false; validOptions = this.allTxnIdOptions; }
            else if (name === 'product') { this.showProductDropdown = false; validOptions = this.allProductOptions; }
            else if (name === 'store') { this.showStoreDropdown = false; validOptions = this.allStoreOptions; }
            else if (name === 'masked') { this.showMaskedDropdown = false; validOptions = this.allMaskedOptions; }

            if (currentValue) {
                const exactMatch = validOptions.find(opt => opt.toLowerCase() === currentValue);
                this.filters = { ...this.filters, [name]: exactMatch ? exactMatch : '' }; 
            }
            this.applyFilters();
        }, 150); 
    }

    clearSelection(event) {
        const name = event.currentTarget.name;
        this.filters = { ...this.filters, [name]: '' };
        
        this.showTxnIdDropdown = false;
        this.showProductDropdown = false;
        this.showStoreDropdown = false;
        this.showMaskedDropdown = false;

        this.applyFilters();
    }

    handleFilterChange(event) {
        const { name, value } = event.target;
        this.filters = { ...this.filters, [name]: value === '' ? null : value };
        this.applyFilters();
    }

    handleClearAll() {
        this.filters = { txnId: '', product: '', store: '', masked: '', minAmt: null, maxAmt: null, dateFrom: null, dateTo: null };
        this.applyFilters();
    }

    // --- JSON Builder for Apex ---
    applyFilters() {
        // We ALWAYS force Status to be Pending only for this component.
        const filterObj = { Status__c: ['Pending'] };

        if (this.filters.txnId) filterObj.Transaction_ID__c = [this.filters.txnId];
        if (this.filters.product) filterObj.Product_Code__c = [this.filters.product];
        if (this.filters.store) filterObj.Store_Location__c = [this.filters.store];
        if (this.filters.masked) filterObj.Masked_Card_Number__c = [this.filters.masked];
        
        if (this.filters.minAmt !== null && this.filters.minAmt !== '') filterObj.minAmount = parseFloat(this.filters.minAmt);
        if (this.filters.maxAmt !== null && this.filters.maxAmt !== '') filterObj.maxAmount = parseFloat(this.filters.maxAmt);
        if (this.filters.dateFrom) filterObj.minDate = this.filters.dateFrom;
        if (this.filters.dateTo) filterObj.maxDate = this.filters.dateTo;

        this.filtersJSON = JSON.stringify(filterObj);

        // Reset scroll variables and clear DOM for fresh fetch
        this.transactions = [];
        this.currentPage = 1;
        this.totalRecords = 0;
        this.enableInfiniteLoading = true;
        this.loadMoreData();
    }

    publishSelection(txnId) {
        publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: txnId });
    }

    handleRowSelection(event) { this.selectedRows = event.detail.selectedRows.map(row => row.Id); }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const rowId = event.detail.row.Id;
        
        if (actionName === 'view_details') {
            this.currentSelectedId = rowId;
            this.publishSelection(rowId);
        } else if (actionName === 'approve_txn') { this.processUpdates([rowId], 'Approved'); }
        else if (actionName === 'cancel_txn') { this.processUpdates([rowId], 'Cancelled'); }
        else if (actionName === 'fraud_txn') { this.processUpdates([rowId], 'Fraudulent'); }
    }

    handleBulkApprove() { this.processUpdates(this.selectedRows, 'Approved'); }
    handleBulkCancel() { this.processUpdates(this.selectedRows, 'Cancelled'); }
    handleBulkFraud() { this.processUpdates(this.selectedRows, 'Fraudulent'); }

    // --- Optimized Action Processor for Infinite Scroll ---
    processUpdates(recordIds, newStatus) {
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' }));
                
                // Surgically remove the rows from the DOM instead of refreshing everything, keeping scroll intact.
                this.transactions = this.transactions.filter(txn => !recordIds.includes(txn.Id));
                this.totalRecords = this.totalRecords - recordIds.length;
                
                this.selectedRows = [];
                this.template.querySelector('lightning-datatable').selectedRows = [];
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                
                if (recordIds.includes(this.currentSelectedId)) {
                    if (this.transactions.length > 0) {
                        this.currentSelectedId = this.transactions[0].Id;
                    } else {
                        this.currentSelectedId = null;
                    }
                }
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            });
    }
}