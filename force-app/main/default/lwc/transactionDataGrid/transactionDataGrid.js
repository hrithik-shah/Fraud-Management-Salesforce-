import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPendingTransactions from '@salesforce/apex/PartnerTransactionController.getPendingTransactions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
import { publish, subscribe, MessageContext, APPLICATION_SCOPE } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import TRANSACTION_UPDATED_CHANNEL from '@salesforce/messageChannel/TransactionUpdated__c';

// --- Styling Dictionaries ---
const STATUS_TABLE_CLASSES = {
    'Approved': 'slds-text-color_success slds-text-title_bold',
    'Fraudulent': 'slds-text-color_error slds-text-title_bold',
    'Cancelled': 'slds-text-color_weak slds-text-title_bold',
    'Pending': 'slds-text-title_bold' 
};

const STATUS_MODAL_CLASSES = {
    'Approved': 'badge badge-approved',
    'Fraudulent': 'badge badge-fraudulent',
    'Cancelled': 'badge badge-cancelled',
    'Pending': 'badge badge-pending'
};

const COLUMNS = [
    { label: 'Transaction ID', fieldName: 'Transaction_ID__c', type: 'text' },
    { 
        label: 'Status', 
        fieldName: 'Status__c', 
        type: 'text',
        cellAttributes: { class: { fieldName: 'statusTableClass' } } 
    },
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
    
    // Data stores
    @track allData = [];      
    @track filteredData = []; 
    @track paginatedData = [];
    selectedRows = [];
    wiredTransactionResult;
    subscription = null;

    // Table State
    @track filters = { Status__c: 'Pending' }; 
    @track activeSorts = []; 
    
    // Pagination State
    currentPage = 1;
    pageSize = 10;
    
    // Modal State
    isModalOpen = false;
    @track selectedRecord = null;

    @wire(MessageContext)
    messageContext;

    get isBulkDisabled() { return this.selectedRows.length === 0; }
    get pageSizeStr() { return this.pageSize.toString(); }
    get totalPages() { return Math.ceil(this.filteredData.length / this.pageSize) || 1; }
    get isFirstPage() { return this.currentPage === 1; }
    get isLastPage() { return this.currentPage >= this.totalPages; }

    get statusOptions() {
        return [
            { label: 'All', value: 'All' },
            { label: 'Pending', value: 'Pending' },
            { label: 'Approved', value: 'Approved' },
            { label: 'Cancelled', value: 'Cancelled' },
            { label: 'Fraudulent', value: 'Fraudulent' }
        ];
    }

    get pageSizeOptions() {
        return [{ label: '10', value: '10' }, { label: '25', value: '25' }, { label: '50', value: '50' }, { label: '100', value: '100' }];
    }

    get sortableColumns() {
        return this.columns.filter(c => c.fieldName && !c.fieldName.includes('statusTableClass')).map(c => ({ label: c.label, value: c.fieldName }));
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
            // Flatten parent relationship and inject CSS classes
            this.allData = result.data.map(row => ({
                ...row,
                Masked_Card_Number__c: row.Card__r ? row.Card__r.Masked_Card_Number__c : '',
                Customer_ID__c: row.Card__r ? row.Card__r.Customer_ID__c : '',
                statusTableClass: STATUS_TABLE_CLASSES[row.Status__c] || '',
                statusModalClass: STATUS_MODAL_CLASSES[row.Status__c] || ''
            }));
            
            this.processDataEngine();
        } else if (result.error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error loading data', message: result.error.body ? result.error.body.message : result.error.message, variant: 'error' }));
        }
    }

    // --- Filter Engine (AND across columns, OR within columns) ---
    handleFilterChange(event) {
        const { name, value } = event.target;
        this.filters = { ...this.filters, [name]: value === '' ? null : value };
        this.currentPage = 1; 
        this.processDataEngine();
    }

    processDataEngine() {
        // 1. Apply Filters
        let result = this.allData.filter(row => {
            let match = true;

            // Handle Text/String Arrays (OR logic within the same column)
            const textFields = ['Transaction_ID__c', 'Product_Code__c', 'Store_Location__c', 'Masked_Card_Number__c', 'Customer_ID__c'];
            textFields.forEach(field => {
                if (this.filters[field]) {
                    const searchTerms = this.filters[field].toLowerCase().split(',').map(s => s.trim()).filter(s => s);
                    if (searchTerms.length > 0) {
                        const rowVal = (row[field] || '').toLowerCase();
                        match = match && searchTerms.some(term => rowVal.includes(term));
                    }
                }
            });

            // Handle Picklist (Status)
            if (this.filters.Status__c && this.filters.Status__c !== 'All') {
                match = match && row.Status__c === this.filters.Status__c;
            }

            // Handle Numeric Ranges (AND logic)
            if (this.filters.minAmount != null) match = match && row.Amount__c >= parseFloat(this.filters.minAmount);
            if (this.filters.maxAmount != null) match = match && row.Amount__c <= parseFloat(this.filters.maxAmount);

            // Handle Date Ranges (AND logic)
            if (this.filters.minDate) {
                let minD = new Date(this.filters.minDate);
                minD.setHours(0,0,0,0);
                match = match && new Date(row.Transaction_Date__c) >= minD;
            }
            if (this.filters.maxDate) {
                let maxD = new Date(this.filters.maxDate);
                maxD.setHours(23,59,59,999);
                match = match && new Date(row.Transaction_Date__c) <= maxD;
            }

            return match;
        });

        // 2. Apply Multi-Sorting
        if (this.activeSorts.length > 0) {
            result.sort((a, b) => {
                for (let sort of this.activeSorts) {
                    let valA = a[sort.fieldName];
                    let valB = b[sort.fieldName];
                    
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

    // --- Multi-Sort Engine ---
    handleAddSort(event) {
        const fieldName = event.detail.value;
        const column = this.columns.find(c => c.fieldName === fieldName);
        
        let existingSortIndex = this.activeSorts.findIndex(s => s.fieldName === fieldName);
        if (existingSortIndex > -1) {
            let currentDir = this.activeSorts[existingSortIndex].direction;
            this.activeSorts[existingSortIndex].direction = currentDir === 'asc' ? 'desc' : 'asc';
            this.activeSorts[existingSortIndex].icon = this.activeSorts[existingSortIndex].direction === 'asc' ? 'utility:arrowup' : 'utility:arrowdown';
        } else {
            this.activeSorts = [...this.activeSorts, { 
                fieldName: fieldName, 
                label: `${column.label}`, 
                direction: 'asc',
                icon: 'utility:arrowup' 
            }];
        }
        
        event.target.value = null; 
        this.processDataEngine();
    }

    handleRemoveSort(event) {
        const index = event.target.name;
        this.activeSorts.splice(index, 1);
        this.activeSorts = [...this.activeSorts]; 
        this.processDataEngine();
    }

    // --- Pagination Engine ---
    handlePageSizeChange(event) {
        this.pageSize = parseInt(event.detail.value, 10);
        this.currentPage = 1;
        this.updatePagination();
    }

    handlePrevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagination();
        }
    }

    handleNextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagination();
        }
    }

    updatePagination() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.paginatedData = this.filteredData.slice(start, end);
    }

    // --- Datatable Actions ---
    handleRowSelection(event) {
        this.selectedRows = event.detail.selectedRows.map(row => row.Id);
    }

    handleRowAction(event) {
        const action = event.detail.action.name;
        const row = event.detail.row;

        switch (action) {
            case 'view_details':
                this.selectedRecord = row;
                this.isModalOpen = true;
                publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: row.Id });
                break;
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
                this.dispatchEvent(
                    new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' })
                );
                
                this.selectedRows = [];
                this.template.querySelector('lightning-datatable').selectedRows = [];
                
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                return refreshApex(this.wiredTransactionResult);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            });
    }

    closeModal() {
        this.isModalOpen = false;
        this.selectedRecord = null;
    }
}