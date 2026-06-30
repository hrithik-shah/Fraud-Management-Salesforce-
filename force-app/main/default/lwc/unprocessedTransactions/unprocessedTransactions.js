import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPendingTransactions from '@salesforce/apex/PartnerTransactionController.getPendingTransactions';
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
    @track allTransactions = []; 
    @track transactions = [];
    @track error;
    
    selectedRows = [];
    currentSelectedId = null; 
    wiredTransactionResult;
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

    @wire(MessageContext)
    messageContext;

    get isBulkDisabled() {
        return this.selectedRows.length === 0;
    }

    // --- CSS Class Getters for Dropdown Visibility ---
    get txnIdComboboxClass() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showTxnIdDropdown ? 'slds-is-open' : ''}`;
    }

    get productComboboxClass() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showProductDropdown ? 'slds-is-open' : ''}`;
    }
    
    get storeComboboxClass() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showStoreDropdown ? 'slds-is-open' : ''}`;
    }
    
    get maskedComboboxClass() {
        return `slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ${this.showMaskedDropdown ? 'slds-is-open' : ''}`;
    }

    connectedCallback() {
        this.subscription = subscribe(
            this.messageContext,
            TRANSACTION_SELECTED_CHANNEL,
            (message) => this.handleMessage(message),
            { scope: APPLICATION_SCOPE }
        );
    }

    handleMessage(message) {
        if (message.action === 'approve_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Approved');
        } else if (message.action === 'cancel_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Cancelled');
        } else if (message.action === 'fraud_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Fraudulent');
        }
    }

    @wire(getPendingTransactions)
    wiredTransactions(result) {
        this.wiredTransactionResult = result;
        if (result.data) {
            this.allTransactions = result.data;
            this.extractUniqueOptions(); 
            this.applyFilters();
            this.error = undefined;

            if (this.transactions.length > 0) {
                const isValid = this.transactions.some(txn => txn.Id === this.currentSelectedId);
                if (!isValid) {
                    this.currentSelectedId = this.transactions[0].Id;
                }
                this.publishSelection(this.currentSelectedId);
            } else {
                this.currentSelectedId = null;
                this.publishSelection(null);
            }
        } else if (result.error) {
            this.error = result.error.body ? result.error.body.message : result.error.message;
            this.transactions = undefined;
        }
    }

    // --- Extract Unique Dropdown Options ---
    extractUniqueOptions() {
        const txnIds = new Set();
        const products = new Set();
        const stores = new Set();
        const maskedCards = new Set();

        this.allTransactions.forEach(txn => {
            if (txn.Transaction_ID__c) txnIds.add(txn.Transaction_ID__c);
            if (txn.Product_Code__c) products.add(txn.Product_Code__c);
            if (txn.Store_Location__c) stores.add(txn.Store_Location__c);
            if (txn.MaskedCard) maskedCards.add(txn.MaskedCard);
        });

        this.allTxnIdOptions = Array.from(txnIds).sort();
        this.allProductOptions = Array.from(products).sort();
        this.allStoreOptions = Array.from(stores).sort();
        this.allMaskedOptions = Array.from(maskedCards).sort();
    }

    // --- Searchable Dropdown Event Handlers ---
    openDropdown(event) {
        const name = event.target.name;
        if (name === 'txnId') {
            this.txnIdOptions = this.allTxnIdOptions;
            this.showTxnIdDropdown = true;
        } else if (name === 'product') {
            this.productOptions = this.allProductOptions;
            this.showProductDropdown = true;
        } else if (name === 'store') {
            this.storeOptions = this.allStoreOptions;
            this.showStoreDropdown = true;
        } else if (name === 'masked') {
            this.maskedOptions = this.allMaskedOptions;
            this.showMaskedDropdown = true;
        }
    }

    handleSearch(event) {
        const name = event.target.name;
        const searchVal = event.target.value.toLowerCase();
        
        this.filters = { ...this.filters, [name]: event.target.value };

        if (name === 'txnId') {
            this.txnIdOptions = this.allTxnIdOptions.filter(opt => opt.toLowerCase().includes(searchVal));
            this.showTxnIdDropdown = true;
        } else if (name === 'product') {
            this.productOptions = this.allProductOptions.filter(opt => opt.toLowerCase().includes(searchVal));
            this.showProductDropdown = true;
        } else if (name === 'store') {
            this.storeOptions = this.allStoreOptions.filter(opt => opt.toLowerCase().includes(searchVal));
            this.showStoreDropdown = true;
        } else if (name === 'masked') {
            this.maskedOptions = this.allMaskedOptions.filter(opt => opt.toLowerCase().includes(searchVal));
            this.showMaskedDropdown = true;
        }
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

            if (name === 'txnId') {
                this.showTxnIdDropdown = false;
                validOptions = this.allTxnIdOptions;
            } else if (name === 'product') {
                this.showProductDropdown = false;
                validOptions = this.allProductOptions;
            } else if (name === 'store') {
                this.showStoreDropdown = false;
                validOptions = this.allStoreOptions;
            } else if (name === 'masked') {
                this.showMaskedDropdown = false;
                validOptions = this.allMaskedOptions;
            }

            if (currentValue) {
                const exactMatch = validOptions.find(opt => opt.toLowerCase() === currentValue);
                if (exactMatch) {
                    this.filters = { ...this.filters, [name]: exactMatch }; 
                } else {
                    this.filters = { ...this.filters, [name]: '' }; 
                }
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

    // --- Standard Filter Handlers (For Min/Max/Dates) ---
    handleFilterChange(event) {
        const { name, value } = event.target;
        // Native date inputs need strictly null instead of an empty string to properly clear bound values
        this.filters = { ...this.filters, [name]: value === '' ? null : value };
        this.applyFilters();
    }

    handleClearAll() {
        this.filters = { txnId: '', product: '', store: '', masked: '', minAmt: null, maxAmt: null, dateFrom: null, dateTo: null };
        this.applyFilters();
    }

    applyFilters() {
        const { txnId, product, store, masked, minAmt, maxAmt, dateFrom, dateTo } = this.filters || {};
        
        const tFilter = txnId ? txnId.toLowerCase() : '';
        const pFilter = product ? product.toLowerCase() : '';
        const sFilter = store ? store.toLowerCase() : '';
        const mFilter = masked ? masked.toLowerCase() : '';
        const minAmount = minAmt ? parseFloat(minAmt) : null;
        const maxAmount = maxAmt ? parseFloat(maxAmt) : null;
        
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;

        // Safely set hours to capture full days
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);

        this.transactions = this.allTransactions.filter(txn => {
            const matchesTxnId = !tFilter || (txn.Transaction_ID__c && txn.Transaction_ID__c.toLowerCase().includes(tFilter));
            const matchesProduct = !pFilter || (txn.Product_Code__c && txn.Product_Code__c.toLowerCase().includes(pFilter));
            const matchesStore = !sFilter || (txn.Store_Location__c && txn.Store_Location__c.toLowerCase().includes(sFilter));
            const matchesMasked = !mFilter || (txn.MaskedCard && txn.MaskedCard.toLowerCase().includes(mFilter));
            const matchesMinAmt = minAmount === null || txn.Amount__c >= minAmount;
            const matchesMaxAmt = maxAmount === null || txn.Amount__c <= maxAmount;
            
            let matchesDateFrom = true;
            let matchesDateTo = true;
            
            if (txn.Transaction_Date__c) {
                const txnDate = new Date(txn.Transaction_Date__c);
                if (fromDate) matchesDateFrom = txnDate >= fromDate;
                if (toDate) matchesDateTo = txnDate <= toDate;
            } else if (fromDate || toDate) {
                matchesDateFrom = false;
            }
            
            return matchesTxnId && matchesProduct && matchesStore && matchesMasked && matchesMinAmt && matchesMaxAmt && matchesDateFrom && matchesDateTo;
        });
    }

    publishSelection(txnId) {
        publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: txnId });
    }

    handleRowSelection(event) {
        this.selectedRows = event.detail.selectedRows.map(row => row.Id);
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const rowId = event.detail.row.Id;
        
        if (actionName === 'view_details') {
            this.currentSelectedId = rowId;
            this.publishSelection(rowId);
        } else if (actionName === 'approve_txn') {
            this.processUpdates([rowId], 'Approved');
        } else if (actionName === 'cancel_txn') {
            this.processUpdates([rowId], 'Cancelled');
        } else if (actionName === 'fraud_txn') {
            this.processUpdates([rowId], 'Fraudulent');
        }
    }

    handleBulkApprove() {
        this.processUpdates(this.selectedRows, 'Approved');
    }

    handleBulkCancel() {
        this.processUpdates(this.selectedRows, 'Cancelled');
    }

    handleBulkFraud() {
        this.processUpdates(this.selectedRows, 'Fraudulent');
    }

    processUpdates(recordIds, newStatus) {
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' })
                );
                
                this.selectedRows = [];
                this.template.querySelector('lightning-datatable').selectedRows = [];
                
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                
                if (recordIds.includes(this.currentSelectedId)) {
                    const currentIndex = this.transactions.findIndex(txn => txn.Id === this.currentSelectedId);
                    if (currentIndex !== -1 && this.transactions.length > 1) {
                        const nextIndex = (currentIndex < this.transactions.length - 1) ? currentIndex + 1 : currentIndex - 1;
                        this.currentSelectedId = this.transactions[nextIndex].Id;
                    } else {
                        this.currentSelectedId = null;
                    }
                }
                
                return refreshApex(this.wiredTransactionResult);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            });
    }
}