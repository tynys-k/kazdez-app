-- Разбор задвоенных выплат.
--
-- Что произошло: в окне выплаты дата подставлялась сегодняшняя, а таблица
-- зарплаты показывала август. Выплата уходила сентябрьским числом, в
-- августовской таблице не появлялась, «К выплате» не менялось — и кнопку
-- нажимали снова. Каждое нажатие записывало новую выплату.
--
-- ШАГ 1. Посмотреть, что записалось (ничего не меняет):

select e.id, p.full_name, e.amount, e.expense_date, e.created_at,
       (select count(*) from public.money_moves m
         where m.source = 'payroll' and m.ref_id = e.id) as movements
from public.tech_expenses e
left join public.profiles p on p.id = e.tech_id
where e.created_at >= date '2026-09-01'
order by e.created_at desc;

-- ШАГ 2. Выбрать, какие строки лишние, и выписать их id из шага 1.
--        Оставить нужно ОДНУ выплату на сумму, которую человек реально
--        получил на руки.
--
-- ШАГ 3. Удалить — сначала движения по кассе, иначе останутся списания
--        без основания и остаток на счёте будет занижен.
--        Подставить свои id вместо примера.

-- begin;
--
-- delete from public.money_moves
--  where source = 'payroll'
--    and ref_id in ('id-лишней-1', 'id-лишней-2');
--
-- delete from public.tech_expenses
--  where id in ('id-лишней-1', 'id-лишней-2');
--
-- commit;

-- ШАГ 4. Проверить остаток счёта после удаления:
-- select a.name,
--        sum(case when m.direction = 'income' then m.amount else -m.amount end) as balance
-- from public.money_moves m join public.accounts a on a.id = m.account_id
-- group by a.name;
