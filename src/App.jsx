-- ============================================================
--  KazDez — операционные расходы бизнеса (не связанные с заявками)
--  категории + подкатегории (настраиваются) и сами расходы с комментарием
--  Выполни в Supabase → SQL Editor → New query → Run. Повторный запуск безопасен.
-- ============================================================

-- Категории и подкатегории. parent_id = NULL → это категория; иначе подкатегория.
create table if not exists expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references expense_categories(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table expense_categories enable row level security;
drop policy if exists expense_categories_select on expense_categories;
create policy expense_categories_select on expense_categories for select to authenticated using (true);
drop policy if exists expense_categories_admin on expense_categories;
create policy expense_categories_admin on expense_categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Сами операционные расходы.
create table if not exists opex (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references expense_categories(id),
  subcategory_id uuid references expense_categories(id),
  amount         numeric not null default 0,
  spent_date     date,
  note           text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
alter table opex enable row level security;
drop policy if exists opex_admin on opex;
create policy opex_admin on opex for all
  using (public.is_admin()) with check (public.is_admin());

-- Немного стартовых категорий с подкатегориями (без дублей при повторном запуске).
do $$
declare
  v_parent uuid;
  cat record;
  sub text;
begin
  for cat in
    select * from (values
      ('Аренда',        array['Офис','Склад']),
      ('Реклама',       array['OLX','Instagram','Google','Yandex','Target']),
      ('Зарплаты (администрация)', array['Бухгалтер','Главный бухгалтер']),
      ('Поставки',      array['Доставка препаратов','Буклеты','Продукты питания']),
      ('Налоги',        array[]::text[]),
      ('Подписки и сервисы', array[]::text[]),
      ('Связь',         array[]::text[]),
      ('Прочее',        array[]::text[])
    ) as t(name, subs)
  loop
    select id into v_parent from expense_categories where name = cat.name and parent_id is null limit 1;
    if v_parent is null then
      insert into expense_categories (name, parent_id) values (cat.name, null) returning id into v_parent;
    end if;
    foreach sub in array cat.subs loop
      if not exists (select 1 from expense_categories where name = sub and parent_id = v_parent) then
        insert into expense_categories (name, parent_id) values (sub, v_parent);
      end if;
    end loop;
  end loop;
end $$;
