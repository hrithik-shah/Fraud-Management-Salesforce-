import { LightningElement, wire, track } from 'lwc';
import getDashboardMetrics from '@salesforce/apex/PartnerDashboardController.getDashboardMetrics';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class PartnerDashboard extends LightningElement {
    isLoading = true;
    wiredMetricsResult;

    @track metrics = {
        currMonthRevenue: 0,
        lastMonthRevenue: 0,
        revenueLost: 0,
        pendingCount: 0,
        fraudCount: 0,
        cancelCount: 0,
        avgTransactionValue: 0,
        topStores: [],
        topProducts: [],
        // repeatCustomerPercent: 0, TODO
    };

    @wire(getDashboardMetrics)
    wiredMetrics(result) {
        this.wiredMetricsResult = result;
        if (result.data) {
            this.metrics = result.data;
            this.isLoading = false;
        } else if (result.error) {
            this.isLoading = false;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error loading dashboard',
                    message: result.error.body ? result.error.body.message : result.error.message,
                    variant: 'error'
                })
            );
        }
    }

    handleRefresh() {
        this.isLoading = true;
        refreshApex(this.wiredMetricsResult).then(() => {
            this.isLoading = false;
        });
    }
}