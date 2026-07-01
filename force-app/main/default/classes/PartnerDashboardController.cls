public with sharing class PartnerDashboardController {
    
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDashboardMetrics() {
        Map<String, Object> metrics = new Map<String, Object>();

        AggregateResult[] revThisMonth = [SELECT SUM(Amount__c) total FROM Transaction__c WHERE Status__c = 'Approved' AND Transaction_Date__c = THIS_MONTH];
        AggregateResult[] revLastMonth = [SELECT SUM(Amount__c) total FROM Transaction__c WHERE Status__c = 'Approved' AND Transaction_Date__c = LAST_MONTH];
        
        metrics.put('currMonthRevenue', revThisMonth.isEmpty() || revThisMonth[0].get('total') == null ? 0 : revThisMonth[0].get('total'));
        metrics.put('lastMonthRevenue', revLastMonth.isEmpty() || revLastMonth[0].get('total') == null ? 0 : revLastMonth[0].get('total'));

        AggregateResult[] revLost = [SELECT SUM(Amount__c) total FROM Transaction__c WHERE Status__c IN ('Fraudulent', 'Cancelled')];
        metrics.put('revenueLost', revLost.isEmpty() || revLost[0].get('total') == null ? 0 : revLost[0].get('total'));

        metrics.put('pendingCount', [SELECT COUNT() FROM Transaction__c WHERE Status__c = 'Pending']);
        metrics.put('fraudCount', [SELECT COUNT() FROM Transaction__c WHERE Status__c = 'Fraudulent' AND Transaction_Date__c = LAST_MONTH]);
        metrics.put('cancelCount', [SELECT COUNT() FROM Transaction__c WHERE Status__c = 'Cancelled' AND Transaction_Date__c = LAST_MONTH]);

        AggregateResult[] avgTxn = [SELECT AVG(Amount__c) avgAmt FROM Transaction__c WHERE Status__c = 'Approved'];
        metrics.put('avgTransactionValue', avgTxn.isEmpty() || avgTxn[0].get('avgAmt') == null ? 0 : avgTxn[0].get('avgAmt'));

        List<Map<String, Object>> topStores = new List<Map<String, Object>>();
        Integer rank = 1;
        for (AggregateResult ar : [SELECT Store_Location__c, SUM(Amount__c) total FROM Transaction__c WHERE Status__c = 'Approved' AND Transaction_Date__c = LAST_MONTH GROUP BY Store_Location__c ORDER BY SUM(Amount__c) DESC LIMIT 3]) {
            topStores.add(new Map<String, Object>{
                'rank' => rank++,
                'name' => ar.get('Store_Location__c'),
                'revenue' => ar.get('total')
            });
        }
        metrics.put('topStores', topStores);

        List<Map<String, Object>> topProducts = new List<Map<String, Object>>();
        for (AggregateResult ar : [SELECT Product_Code__c, COUNT(Id) total FROM Transaction__c WHERE Status__c = 'Approved' GROUP BY Product_Code__c ORDER BY COUNT(Id) DESC LIMIT 3]) {
            topProducts.add(new Map<String, Object>{
                'name' => ar.get('Product_Code__c'),
                'count' => ar.get('total')
            });
        }
        metrics.put('topProducts', topProducts);

        // metrics.put('repeatCustomerPercent', ); 

        return metrics;
    }
}