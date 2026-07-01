import { LightningElement, track, wire } from 'lwc';
import getCards from '@salesforce/apex/EmployeeCardController.getCards';
import { refreshApex } from '@salesforce/apex';

const COLUMNS = [
    { label: 'Card Number / ID', fieldName: 'Name' },
    { label: 'Status', fieldName: 'Status__c' },
    { 
        type: 'action',
        typeAttributes: { rowActions: [{ label: 'Verify & Secure', name: 'launch_flow' }] }
    }
];

export default class EmployeeCardBrowser extends LightningElement {
    columns = COLUMNS;
    
    @track filterValue = 'Flagged';
    @track cards = [];
    @track isFlowOpen = false;
    
    @track activeFlowApiName;
    @track flowModalTitle;
    @track flowVariables = [];
    
    wiredCardsResult;

    get filterOptions() {
        return [
            { label: 'Flagged Cards Only', value: 'Flagged' },
            { label: 'All Cards', value: 'All' }
        ];
    }

    @wire(getCards, { filterMode: '$filterValue' })
    wiredCards(result) {
        this.wiredCardsResult = result;
        if (result.data) {
            this.cards = result.data;
        } else if (result.error) {
            console.error('Error fetching cards:', result.error);
        }
    }

    handleFilterChange(event) {
        this.filterValue = event.detail.value;
    }

    handleRefresh() {
        refreshApex(this.wiredCardsResult);
    }

    openFindAndReportStolenFlow() {
        this.flowVariables = [];
        this.activeFlowApiName = 'Find_and_Report_Stolen_Card';
        this.flowModalTitle = 'Report Stolen Card';
        this.isFlowOpen = true;
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        if (actionName === 'launch_flow') {
            this.flowVariables = [
                {
                    name: 'recordId',
                    type: 'String',
                    value: row.Id
                }
            ];
            this.activeFlowApiName = 'Stolen_Card';
            this.flowModalTitle = 'Verify & Secure Card';
            this.isFlowOpen = true;
        }
    }

    closeModal() {
        this.isFlowOpen = false;
        this.activeFlowApiName = null;
    }

    handleFlowStatusChange(event) {
        if (event.detail.status === 'FINISHED' || event.detail.status === 'FINISHED_SCREEN') {
            this.closeModal();
            refreshApex(this.wiredCardsResult);
        }
    }
}