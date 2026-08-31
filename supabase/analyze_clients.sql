-- =====================================================================
-- Разбор перед введением сущности «клиент». ТОЛЬКО ЧТЕНИЕ.
--
-- Сейчас клиент опознаётся сравнением цифр телефона. Из-за этого
-- «+7 777 442 33 84» и «8 777 442 33 84» — РАЗНЫЕ клиенты, хотя это
-- один человек. Запрос показывает, сколько таких расхождений накопилось.
-- =====================================================================

with norm as (
  select
    id,
    client_phone                                                as raw,
    regexp_replace(coalesce(client_phone,''), '\D', '', 'g')    as digits,
    right(regexp_replace(coalesce(client_phone,''), '\D', '', 'g'), 10) as last10,
    contact_name, address, scheduled_date, status
  from jobs
)
select 'Всего заявок'                              as показатель, count(*)::text as значение from norm
union all
select 'Заявок без телефона',        count(*)::text from norm where length(digits) < 10
union all
select 'Разных телефонов как записаны', count(distinct raw)::text from norm where length(digits) >= 10
union all
select 'Разных по «только цифры» (как считает приложение сейчас)', count(distinct digits)::text from norm where length(digits) >= 10
union all
select 'Разных по последним 10 цифрам (реальные люди)', count(distinct last10)::text from norm where length(digits) >= 10
union all
select '→ ДУБЛЕЙ из-за формата +7 / 8',
       (count(distinct digits) - count(distinct last10))::text from norm where length(digits) >= 10
union all
select 'Клиентов с 2+ заявками (повторные)',
       count(*)::text from (select last10 from norm where length(digits) >= 10 group by last10 having count(*) > 1) t
union all
select 'Телефонов с разными именами контакта',
       count(*)::text from (
         select last10 from norm
         where length(digits) >= 10 and coalesce(contact_name,'') <> ''
         group by last10 having count(distinct contact_name) > 1
       ) t;

-- Примеры склеек: один человек, записанный по-разному
select right(regexp_replace(client_phone,'\D','','g'),10) as телефон,
       array_agg(distinct client_phone)                   as как_записан,
       count(*)                                           as заявок
from jobs
where length(regexp_replace(coalesce(client_phone,''),'\D','','g')) >= 10
group by 1
having count(distinct regexp_replace(client_phone,'\D','','g')) > 1
order by 3 desc
limit 15;
