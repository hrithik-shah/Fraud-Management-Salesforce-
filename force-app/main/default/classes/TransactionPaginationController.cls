public with sharing class TransactionPaginationController {
    
    public class PagedResult {
        @AuraEnabled public Integer totalItemCount { get; set; }
        @AuraEnabled public List<Transaction__c> records { get; set; }
    }

    @AuraEnabled(cacheable=true)
    public static PagedResult getPaginatedTransactions(Integer pageSize, Integer pageNumber, String filtersJSON, String sortsJSON) {
        Integer offset = (pageNumber - 1) * pageSize;
        
        String selectClause = 'SELECT Id, Transaction_ID__c, Status__c, Amount__c, Transaction_Date__c, Product_Code__c, Store_Location__c, Card__r.Masked_Card_Number__c, Card__r.Customer_Contact__r.Customer_ID__c FROM Transaction__c';
        String countClause = 'SELECT COUNT() FROM Transaction__c';
        String whereClause = buildWhereClause(filtersJSON);
        String orderClause = buildOrderClause(sortsJSON);
        String limitOffset = ' LIMIT :pageSize OFFSET :offset';

        PagedResult result = new PagedResult();
        
        result.totalItemCount = Database.countQuery(countClause + whereClause);
        
        result.records = Database.query(selectClause + whereClause + orderClause + limitOffset);
        
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, List<String>> getFilterOptions() {
        Map<String, List<String>> options = new Map<String, List<String>>{
            'Transaction_ID__c' => new List<String>(),
            'Product_Code__c' => new List<String>(),
            'Customer_ID__c' => new List<String>(),
            'Store_Location__c' => new List<String>()
        };

        for (AggregateResult ar : [SELECT Transaction_ID__c FROM Transaction__c WHERE Transaction_ID__c != null GROUP BY Transaction_ID__c LIMIT 1000]) {
            options.get('Transaction_ID__c').add((String)ar.get('Transaction_ID__c'));
        }
        for (AggregateResult ar : [SELECT Product_Code__c FROM Transaction__c WHERE Product_Code__c != null GROUP BY Product_Code__c LIMIT 1000]) {
            options.get('Product_Code__c').add((String)ar.get('Product_Code__c'));
        }
        for (AggregateResult ar : [SELECT Store_Location__c FROM Transaction__c WHERE Store_Location__c != null GROUP BY Store_Location__c LIMIT 1000]) {
            options.get('Store_Location__c').add((String)ar.get('Store_Location__c'));
        }
        for (AggregateResult ar : [SELECT Card__r.Customer_Contact__r.Customer_ID__c custId FROM Transaction__c WHERE Card__r.Customer_Contact__r.Customer_ID__c != null GROUP BY Card__r.Customer_Contact__r.Customer_ID__c LIMIT 1000]) {
            options.get('Customer_ID__c').add((String)ar.get('custId'));
        }
        
        return options;
    }

    private static String buildWhereClause(String filtersJSON) {
        if (String.isBlank(filtersJSON) || filtersJSON == '{}') return '';
        
        Map<String, Object> filters = (Map<String, Object>) JSON.deserializeUntyped(filtersJSON);
        List<String> conditions = new List<String>();

        String[] arrayFields = new String[]{'Status__c', 'Transaction_ID__c', 'Product_Code__c', 'Store_Location__c'};
        for (String field : arrayFields) {
            if (filters.containsKey(field)) {
                List<Object> values = (List<Object>) filters.get(field);
                if (!values.isEmpty()) {
                    List<String> stringValues = new List<String>();
                    for(Object val : values) { stringValues.add('\'' + String.escapeSingleQuotes((String)val) + '\''); }
                    conditions.add(field + ' IN (' + String.join(stringValues, ',') + ')');
                }
            }
        }

        if (filters.containsKey('Customer_ID__c')) {
            List<Object> custValues = (List<Object>) filters.get('Customer_ID__c');
            if(!custValues.isEmpty()){
                List<String> stringValues = new List<String>();
                for(Object val : custValues) { stringValues.add('\'' + String.escapeSingleQuotes((String)val) + '\''); }
                conditions.add('Card__r.Customer_Contact__r.Customer_ID__c IN (' + String.join(stringValues, ',') + ')');
            }
        }

        if (filters.containsKey('minAmount') && filters.get('minAmount') != null) {
            conditions.add('Amount__c >= ' + Decimal.valueOf(String.valueOf(filters.get('minAmount'))));
        }
        if (filters.containsKey('maxAmount') && filters.get('maxAmount') != null) {
            conditions.add('Amount__c <= ' + Decimal.valueOf(String.valueOf(filters.get('maxAmount'))));
        }

        if (filters.containsKey('minDate') && filters.get('minDate') != null) {
            conditions.add('Transaction_Date__c >= ' + String.valueOf(filters.get('minDate')) + 'T00:00:00Z');
        }
        if (filters.containsKey('maxDate') && filters.get('maxDate') != null) {
            conditions.add('Transaction_Date__c <= ' + String.valueOf(filters.get('maxDate')) + 'T23:59:59Z');
        }

        return conditions.isEmpty() ? '' : ' WHERE ' + String.join(conditions, ' AND ');
    }

    private static String buildOrderClause(String sortsJSON) {
        if (String.isBlank(sortsJSON) || sortsJSON == '[]') return ' ORDER BY Transaction_Date__c DESC'; 
        
        List<Object> sorts = (List<Object>) JSON.deserializeUntyped(sortsJSON);
        List<String> orderings = new List<String>();
        
        for (Object s : sorts) {
            Map<String, Object> sortObj = (Map<String, Object>) s;
            String field = String.escapeSingleQuotes((String)sortObj.get('fieldName'));
            String dir = String.escapeSingleQuotes((String)sortObj.get('direction'));
            orderings.add(field + ' ' + (dir.toLowerCase() == 'asc' ? 'ASC' : 'DESC'));
        }
        
        return orderings.isEmpty() ? ' ORDER BY Transaction_Date__c DESC' : ' ORDER BY ' + String.join(orderings, ', ');
    }
}