import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPaginatedTransactions from '@salesforce/apex/TransactionPaginationController.getPaginatedTransactions';
import getFilterOptions from '@salesforce/apex/TransactionPaginationController.getFilterOptions';
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
    
    @track paginatedData = [];
    @track totalRecords = 0;
    @track globalSelectedRows = [];
    wiredTransactionResult;
    subscription = null;

    currentPage = 1; 
    pageSize = 20;
    @track filtersJSON = '{}';
    @track sortsJSON = '[]';

    @track isFilterPopupOpen = false;
    @track isSortPopupOpen = false;
    isModalOpen = false; 
    @track selectedRecord = null;

    @track activeSorts = []; 
    
    @track filters = { 
        Status__c: ['Pending'], 
        Transaction_ID__c: [], 
        Product_Code__c: [], 
        Customer_ID__c: [], 
        Store_Location__c: [], 
        minAmount: null, maxAmount: null, 
        minDate: null, maxDate: null 
    }; 
    
    @track allFilterOptions = {
        allTxnIdOptions: [],
        allProductOptions: [],
        allCustomerOptions: [],
        allStoreOptions: []
    };

    @wire(MessageContext) messageContext;

    get currentPageSelectedRows() {
        if (!this.paginatedData) return [];
        const currentPageIds = this.paginatedData.map(row => row.Id);
        return this.globalSelectedRows.filter(id => currentPageIds.includes(id));
    }

    get isBulkDisabled() { return this.currentPageSelectedRows.length === 0; }
    get pageSizeStr() { return this.pageSize.toString(); }
    get totalPages() { return Math.ceil(this.totalRecords / this.pageSize) || 1; }
    get isFirstPage() { return this.currentPage === 1; }
    get isLastPage() { return this.currentPage >= this.totalPages; }
    get pageSizeOptions() { return [{ label: '10', value: '10' }, { label: '20', value: '20' }, { label: '50', value: '50' }, { label: '100', value: '100' }]; }
    get sortableColumns() { return this.columns.filter(c => c.fieldName && !c.fieldName.includes('statusTableClass')).map(c => ({ label: c.label, value: c.fieldName })); }

    get filterButtonClass() { return this.isFilterPopupOpen || this.activeFilterTags.length > 0 ? 'dribbble-btn active-btn' : 'dribbble-btn'; }
    get sortButtonClass() { return this.isSortPopupOpen || this.activeSorts.length > 0 ? 'dribbble-btn active-btn' : 'dribbble-btn'; }
    get hasActiveFiltersOrSorts() { return this.activeFilterTags.length > 0 || this.activeSorts.length > 0; }

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
        this.filtersJSON = JSON.stringify(this.filters); 
    }

    handleMessage(msg) {
        if (msg.action === 'approve_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Approved');
        else if (msg.action === 'cancel_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Cancelled');
        else if (msg.action === 'fraud_txn' && msg.transactionId) this.processUpdates([msg.transactionId], 'Fraudulent');
    }

    @wire(getFilterOptions)
    wiredFilterOptions({ error, data }) {
        if (data) {
            this.allFilterOptions = {
                allTxnIdOptions: data.Transaction_ID__c || [],
                allProductOptions: data.Product_Code__c || [],
                allCustomerOptions: data.Customer_ID__c || [],
                allStoreOptions: data.Store_Location__c || []
            };
        } else if (error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error loading filters', message: error.body?.message || error.message, variant: 'error' }));
        }
    }

    @wire(getPaginatedTransactions, { pageSize: '$pageSize', pageNumber: '$currentPage', filtersJSON: '$filtersJSON', sortsJSON: '$sortsJSON' })
    wiredTransactions(result) {
        this.wiredTransactionResult = result;
        if (result.data) {
            this.totalRecords = result.data.totalItemCount;
            this.paginatedData = result.data.records.map(row => ({
                ...row,
                Masked_Card_Number__c: row.Card__r ? row.Card__r.Masked_Card_Number__c : '',
                Customer_ID__c: row.Card__r && row.Card__r.Customer_Contact__r ? row.Card__r.Customer_Contact__r.Customer_ID__c : '',
                statusTableClass: STATUS_TABLE_CLASSES[row.Status__c] || '',
                statusModalClass: STATUS_MODAL_CLASSES[row.Status__c] || ''
            }));
            
            this.globalSelectedRows = [...this.globalSelectedRows];
        } else if (result.error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: result.error.body?.message || result.error.message, variant: 'error' }));
        }
    }

    toggleSortPopup() {
        this.isSortPopupOpen = !this.isSortPopupOpen;
        if (this.isSortPopupOpen) this.isFilterPopupOpen = false;
    }

    toggleFilterPopup() {
        this.isFilterPopupOpen = !this.isFilterPopupOpen;
        if (this.isFilterPopupOpen) this.isSortPopupOpen = false;
    }

    closeModal() { 
        this.isModalOpen = false; 
        this.selectedRecord = null; 
    }

    handleSortApply(event) {
        this.activeSorts = event.detail.activeSorts;
        this.sortsJSON = JSON.stringify(this.activeSorts);
        this.isSortPopupOpen = false;
        this.currentPage = 1;
    }

    handleFilterApply(event) {
        this.filters = { ...event.detail.filters };
        this.filtersJSON = JSON.stringify(this.filters);
        this.isFilterPopupOpen = false;
        this.currentPage = 1;
    }

    handleRemoveFilter(event) {
        const fieldName = event.target.name;
        this.filters = { ...this.filters, [fieldName]: (fieldName.includes('Amount') || fieldName.includes('Date')) ? null : [] };
        this.filtersJSON = JSON.stringify(this.filters);
        this.currentPage = 1;
    }

    handleRemoveSort(event) { 
        this.activeSorts.splice(event.target.name, 1); 
        this.activeSorts = [...this.activeSorts]; 
        this.sortsJSON = JSON.stringify(this.activeSorts);
    }

    handlePageSizeChange(event) { 
        this.pageSize = parseInt(event.detail.value, 10); 
        this.currentPage = 1; 
    }
    
    handlePrevPage() { 
        if (this.currentPage > 1) this.currentPage--; 
    }
    
    handleNextPage() { 
        if (this.currentPage < this.totalPages) this.currentPage++; 
    }

    handleRowSelection(event) { 
        if (!event.detail.config) return;

        const currentPageIds = this.paginatedData.map(row => row.Id);
        const selectedOnPage = event.detail.selectedRows.map(row => row.Id);
        
        let updatedGlobal = this.globalSelectedRows.filter(id => !currentPageIds.includes(id));
        updatedGlobal = [...updatedGlobal, ...selectedOnPage];
        
        this.globalSelectedRows = updatedGlobal;
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
    
    handleBulkApprove() { this.processUpdates(this.currentPageSelectedRows, 'Approved'); }
    handleBulkCancel() { this.processUpdates(this.currentPageSelectedRows, 'Cancelled'); }
    handleBulkFraud() { this.processUpdates(this.currentPageSelectedRows, 'Fraudulent'); }

    processUpdates(recordIds, newStatus) {
        if (!recordIds || recordIds.length === 0) return;
        
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' }));
                
                this.globalSelectedRows = this.globalSelectedRows.filter(id => !recordIds.includes(id));
                
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                return refreshApex(this.wiredTransactionResult);
            })
            .catch(error => this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body?.message || error.message, variant: 'error' })));
    }
}