UPDATE rooms SET candidates = (
  SELECT json_group_array(json(CASE
    WHEN json_extract(value, '$.source') = 'hotpepper' THEN json_object(
      'id', json_extract(value, '$.id'),
      'source', 'hotpepper',
      'distance', json_extract(value, '$.distance'),
      'distanceUnknown', json(CASE WHEN json_extract(value, '$.distanceUnknown') THEN 'true' ELSE 'false' END)
    ) ELSE value END))
  FROM json_each(rooms.candidates)
) WHERE EXISTS (
  SELECT 1 FROM json_each(rooms.candidates) WHERE json_extract(value, '$.source') = 'hotpepper'
);
